# AIQE Changelog

## [0.3.0] - 2026-03-30
- Fix SAP Excel import: convert xlsx to dynamic import to prevent webpack bundling crash
- Fix column-mapping headers fetch: changed from GET (no body) to POST ?headers=1
- Add build versioning: version badge in admin sidebar, /api/version endpoint
- Inject NEXT_PUBLIC_BUILD_TIME and NEXT_PUBLIC_COMMIT_HASH at build time

## [0.2.0] - 2026-03-29
- Fix PDF ingestion: replaced pdf-parse with unpdf (serverless-safe, per-page error recovery)
- Fix admin categories: main/sub category multi-select with hierarchy
- Add "Select all / Clear all" for regions in catalog upload
- Add Training Data import page for customer query → product recommendation pairs
- Fix region labels: replaced country list with 9 regions (India, SAARC, MENA, etc.)
- Improve error surfacing: all API routes now return actual error messages

## [0.1.0] - 2026-03-28
- Initial build: query interface, vector search, feedback loop
- Supabase schema with pgvector, RLS, auto-profile trigger
- Admin panel: catalog PDFs, competitor X-refs, feedback promotion, SAP import
- Cloudflare R2 integration for PDF storage
- OpenAI text-embedding-3-small + Anthropic Claude for ranking
