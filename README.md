# AIQE — Axis Intelligence Quoting Engine

An internal web application for Axis India sales engineers to find matching Axis products from client queries — in any language, using competitor references or free-form descriptions.

## How it works

1. An engineer pastes a client query (any language, competitor part numbers, or descriptions)
2. AIQE embeds the query and performs a vector similarity search against the Axis product catalog
3. Claude AI re-ranks the top candidates and provides English reasoning for each match
4. The engineer approves the correct match or corrects it — corrections improve future results automatically

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with the **pgvector** extension enabled
- OpenAI API key (for embeddings — `text-embedding-3-small`)
- Anthropic API key (for Claude product matching)
- Cloudflare R2 bucket (for PDF catalog storage)

### 1. Clone and install

```bash
git clone <repo-url>
cd <repo>
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=aiqe-catalogs
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

### 3. Set up the Supabase database

In the Supabase dashboard, go to **SQL Editor** and run the full schema:

```bash
# Copy the contents of supabase/schema.sql and run it in the Supabase SQL editor
```

This will:
- Enable the `pgvector` extension
- Create all tables (`products`, `product_embeddings`, `competitor_crossrefs`, `catalog_documents`, `queries`, `feedback`, `users_profile`)
- Set up Row Level Security (RLS) policies
- Create the `match_products` and `match_feedback` RPC functions used for vector search
- Set up the trigger that auto-creates a user profile on signup

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page.

---

## Creating the First Admin User

1. Go to your Supabase project → **Authentication** → **Users** → **Add user**
2. Create a user with email and password
3. In the SQL editor, run:

```sql
update users_profile
set role = 'admin'
where id = '<the-user-uuid>';
```

This user can now access all `/admin/*` routes. All subsequently created users default to the `engineer` role.

---

## First SAP Import

1. Log in as admin and navigate to **Admin → Import**
2. Select your SAP export file (CSV or Excel)
3. If column headers don't match the expected format, use the column mapping UI to map your headers to: `sku`, `name`, `description`, `family`, `countries`
4. Click **Start Import**

The importer will:
- Upsert all products into the `products` table
- Automatically generate and store OpenAI embeddings for all new or changed products
- Report how many records were imported and how many embeddings were updated

---

## Uploading and Ingesting the First Catalog PDF

1. Log in as admin and navigate to **Admin → Catalog PDFs**
2. Click **Upload PDF**
3. Fill in:
   - **Product family** — e.g., "Motor Protection"
   - **Applicable countries** — select the countries this catalog covers
4. Select the PDF file and click **Upload & Ingest**

The ingestion pipeline will:
1. Download the PDF from Cloudflare R2
2. Extract text page by page
3. Chunk into ~500-token segments with 50-token overlap
4. Find any Axis SKUs mentioned in each chunk
5. Enrich those products' embedding text with the catalog context
6. Re-embed affected products using OpenAI

This process enriches the vector index so product searches benefit from catalog language and specifications.

---

## The Feedback Learning Loop

### What happens immediately when an engineer corrects a match

When an engineer clicks "Wrong — correct it" and submits the correction:
1. The correction is saved to the `feedback` table with `promoted_to_index = false`
2. On the **next query**, AIQE embeds the incoming query and compares it against all stored feedback corrections (using cosine similarity < 0.15 threshold)
3. If a similar past correction is found, that SKU is boosted to rank 1 with `confidence: high` and reasoning of "Based on previous engineer correction"

This means corrections take effect **immediately for similar future queries**, without any admin action required.

### Admin-controlled promotion (permanent improvement)

For a permanent improvement to the vector index:

1. Go to **Admin → Feedback**
2. Review the list of corrections
3. Select corrections to promote (or click "Select all pending")
4. Click **Promote to Index**

When promoted, AIQE:
1. Takes the original query text and adds it as an **alias** to the correct product's embedding text
2. Re-embeds the enriched product text with OpenAI
3. Updates the `product_embeddings` table
4. Marks the feedback as `promoted_to_index = true`

This permanently trains the vector index so that queries similar to the original will reliably match the correct product, even without the feedback similarity check.

---

## Application Routes

| Route | Access | Description |
|---|---|---|
| `/auth/login` | Public | Sign in page |
| `/dashboard` | Engineer, Admin | Home with recent queries and stats |
| `/query` | Engineer, Admin | Main query interface |
| `/admin/catalog` | Admin | Upload and manage catalog PDFs |
| `/admin/crossrefs` | Admin | Competitor cross-reference management |
| `/admin/feedback` | Admin | Review and promote engineer corrections |
| `/admin/products` | Admin | Browse and re-embed products |
| `/admin/import` | Admin | SAP and cross-ref file import |

---

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/query/match` | Run semantic search + Claude ranking |
| POST | `/api/query/feedback` | Save engineer correction |
| PATCH | `/api/query/feedback` | Approve a match |
| POST | `/api/catalog/upload` | Upload PDF to R2 |
| POST | `/api/catalog/ingest` | Extract, chunk, and embed PDF |
| DELETE | `/api/catalog/delete` | Delete PDF from R2 and DB |
| POST | `/api/import/sap` | Import SAP product export |
| POST | `/api/import/crossrefs` | Import competitor cross-ref Excel |
| POST | `/api/embed/product` | Re-embed a single product |
| POST | `/api/embed/feedback` | Promote feedback to vector index |
| GET | `/api/products/search` | Typeahead search for SKU input |
| GET/POST/DELETE/PATCH | `/api/admin/crossrefs` | CRUD for cross-references |
| POST | `/api/admin/feedback/promote` | Bulk promote feedback corrections |

---

## Deployment to Vercel + Supabase Production

### 1. Supabase production setup

1. Create a new Supabase project (or use an existing one)
2. Run `supabase/schema.sql` in the SQL editor
3. Enable the pgvector extension if not already done:
   ```sql
   create extension if not exists vector;
   ```
4. Copy your project URL, anon key, and service role key

### 2. Cloudflare R2 setup

1. Create an R2 bucket named `aiqe-catalogs` (or your preferred name)
2. Create an API token with **Object Read & Write** permissions
3. Enable public access or set up a custom domain for the public URL

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect the GitHub repository in the Vercel dashboard for automatic deployments.

### 4. Set environment variables in Vercel

In the Vercel project settings → **Environment Variables**, add all variables from `.env.example` with your production values.

### 5. Post-deployment

1. Create your first admin user via Supabase Authentication
2. Promote them to admin via SQL (see above)
3. Run your first SAP import to populate the product catalog
4. Upload your first catalog PDF to enrich the embeddings

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres + pgvector) |
| AI matching | Anthropic Claude `claude-sonnet-4-20250514` |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| File storage | Cloudflare R2 |
| PDF extraction | pdf-parse (Node.js) |
| Auth | Supabase Auth (email/password) |
| Deployment | Vercel |
