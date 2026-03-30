/** @type {import('next').NextConfig} */
const nextConfig = {
  // unpdf (and its bundled pdfjs-dist) must not be bundled by webpack —
  // it configures its own worker at runtime from node_modules.
  serverExternalPackages: ['unpdf', 'xlsx'],
  experimental: {
    serverComponentsExternalPackages: ['unpdf', 'xlsx'],
    // Increase max body size for PDF uploads (10MB)
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
