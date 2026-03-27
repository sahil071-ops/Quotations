-- AIQE Database Schema
-- Run this against your Supabase project

-- Enable pgvector
create extension if not exists vector;

-- Products table
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  family text,
  specifications jsonb,
  countries text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Product embeddings table
create table if not exists product_embeddings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  content_hash text,
  embedding vector(1536),
  embedded_text text,
  created_at timestamptz default now()
);

create index if not exists product_embeddings_embedding_idx
  on product_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Competitor cross-references
create table if not exists competitor_crossrefs (
  id uuid primary key default gen_random_uuid(),
  competitor_name text not null,
  competitor_sku text not null,
  axis_sku text references products(sku),
  confidence text check (confidence in ('high', 'medium', 'low')) default 'medium',
  notes text,
  created_at timestamptz default now(),
  unique(competitor_name, competitor_sku)
);

-- Catalog documents
create table if not exists catalog_documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  r2_key text not null,
  product_family text,
  countries text[],
  page_count int,
  status text check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending',
  error_message text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Queries log
create table if not exists queries (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid references auth.users(id),
  raw_query text not null,
  detected_language text,
  country_context text,
  top_matches jsonb,
  selected_sku text,
  was_corrected boolean default false,
  created_at timestamptz default now()
);

-- Feedback / corrections
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  query_id uuid references queries(id),
  engineer_id uuid references auth.users(id),
  raw_query text not null,
  country_context text,
  ai_suggested_sku text,
  correct_sku text not null,
  correction_notes text,
  promoted_to_index boolean default false,
  promoted_at timestamptz,
  promoted_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- User profiles
create table if not exists users_profile (
  id uuid primary key references auth.users(id),
  full_name text,
  role text check (role in ('engineer', 'admin')) default 'engineer',
  created_at timestamptz default now()
);

-- RLS Policies

-- Products: anyone authenticated can read
alter table products enable row level security;
create policy "Authenticated users can read products"
  on products for select using (auth.role() = 'authenticated');
create policy "Admins can modify products"
  on products for all using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );

-- Product embeddings: service role only for writes, authenticated for reads
alter table product_embeddings enable row level security;
create policy "Authenticated users can read embeddings"
  on product_embeddings for select using (auth.role() = 'authenticated');
create policy "Service role can modify embeddings"
  on product_embeddings for all using (auth.role() = 'service_role');

-- Queries: engineers see their own, admins see all
alter table queries enable row level security;
create policy "Engineers see own queries"
  on queries for select using (engineer_id = auth.uid());
create policy "Admins see all queries"
  on queries for select using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );
create policy "Engineers insert own queries"
  on queries for insert with check (engineer_id = auth.uid());
create policy "Engineers update own queries"
  on queries for update using (engineer_id = auth.uid());

-- Feedback: engineers see their own, admins see all
alter table feedback enable row level security;
create policy "Engineers see own feedback"
  on feedback for select using (engineer_id = auth.uid());
create policy "Admins see all feedback"
  on feedback for select using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );
create policy "Engineers insert own feedback"
  on feedback for insert with check (engineer_id = auth.uid());
create policy "Admins update feedback"
  on feedback for update using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );

-- Catalog documents: admins only
alter table catalog_documents enable row level security;
create policy "Admins manage catalog documents"
  on catalog_documents for all using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );

-- Competitor crossrefs: authenticated can read, admins can write
alter table competitor_crossrefs enable row level security;
create policy "Authenticated users can read crossrefs"
  on competitor_crossrefs for select using (auth.role() = 'authenticated');
create policy "Admins can modify crossrefs"
  on competitor_crossrefs for all using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );

-- Users profile: users see their own, admins see all
alter table users_profile enable row level security;
create policy "Users see own profile"
  on users_profile for select using (id = auth.uid());
create policy "Admins see all profiles"
  on users_profile for select using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );
create policy "Users insert own profile"
  on users_profile for insert with check (id = auth.uid());
create policy "Users update own profile"
  on users_profile for update using (id = auth.uid());

-- Function to auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users_profile (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'engineer')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Semantic similarity search function
create or replace function match_products(
  query_embedding vector(1536),
  country_filter text,
  match_count int default 10
)
returns table (
  id uuid,
  sku text,
  name text,
  description text,
  family text,
  specifications jsonb,
  countries text[],
  distance float
)
language sql stable
as $$
  select
    p.id,
    p.sku,
    p.name,
    p.description,
    p.family,
    p.specifications,
    p.countries,
    pe.embedding <=> query_embedding as distance
  from product_embeddings pe
  join products p on p.id = pe.product_id
  where country_filter = any(p.countries)
    and p.is_active = true
  order by distance asc
  limit match_count;
$$;

-- Feedback similarity search
create or replace function match_feedback(
  query_embedding vector(1536),
  similarity_threshold float default 0.15,
  match_count int default 5
)
returns table (
  id uuid,
  query_id uuid,
  raw_query text,
  correct_sku text,
  correction_notes text,
  distance float
)
language sql stable
as $$
  select
    f.id,
    f.query_id,
    f.raw_query,
    f.correct_sku,
    f.correction_notes,
    pe.embedding <=> query_embedding as distance
  from feedback f
  join products p on p.sku = f.correct_sku
  join product_embeddings pe on pe.product_id = p.id
  where pe.embedding <=> query_embedding < similarity_threshold
  order by distance asc
  limit match_count;
$$;

-- ============================================================
-- MIGRATION: run these in Supabase SQL editor if upgrading
-- ============================================================

-- Hierarchical product categories
create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  main_category text not null,
  sub_category text not null,
  created_at timestamptz default now(),
  unique(main_category, sub_category)
);

alter table product_categories enable row level security;
create policy "Authenticated users can read categories"
  on product_categories for select using (auth.role() = 'authenticated');
create policy "Admins can modify categories"
  on product_categories for all using (
    exists (select 1 from users_profile where id = auth.uid() and role = 'admin')
  );

-- Add sub_categories column to catalog_documents
alter table catalog_documents add column if not exists sub_categories text[];
