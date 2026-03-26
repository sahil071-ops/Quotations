export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  family?: string | null;
  specifications?: Record<string, unknown> | null;
  countries?: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductEmbedding {
  id: string;
  product_id: string;
  content_hash?: string | null;
  embedding?: number[] | null;
  embedded_text?: string | null;
  created_at: string;
}

export interface CompetitorCrossref {
  id: string;
  competitor_name: string;
  competitor_sku: string;
  axis_sku?: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes?: string | null;
  created_at: string;
}

export interface CatalogDocument {
  id: string;
  filename: string;
  r2_key: string;
  product_family?: string | null;
  countries?: string[] | null;
  page_count?: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface Query {
  id: string;
  engineer_id?: string | null;
  raw_query: string;
  detected_language?: string | null;
  country_context?: string | null;
  top_matches?: MatchResult[] | null;
  selected_sku?: string | null;
  was_corrected: boolean;
  created_at: string;
}

export interface Feedback {
  id: string;
  query_id?: string | null;
  engineer_id?: string | null;
  raw_query: string;
  country_context?: string | null;
  ai_suggested_sku?: string | null;
  correct_sku: string;
  correction_notes?: string | null;
  promoted_to_index: boolean;
  promoted_at?: string | null;
  promoted_by?: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name?: string | null;
  role: 'engineer' | 'admin';
  created_at: string;
}

export interface MatchResult {
  rank: number;
  sku: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  family?: string | null;
  specifications?: Record<string, unknown> | null;
  description?: string | null;
}

export interface QueryMatchResponse {
  query_id: string;
  detected_language: string;
  matches: MatchResult[];
}

export interface ApiError {
  error: string;
}
