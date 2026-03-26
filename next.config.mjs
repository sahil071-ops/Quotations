/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling pdfjs-dist (ESM-only); Node.js loads it
  // natively from node_modules at runtime via dynamic import().
  serverExternalPackages: ['pdfjs-dist'],
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
    // Increase max body size for PDF uploads (10MB)
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
