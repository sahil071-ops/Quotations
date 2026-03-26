/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14.1+ stable key — prevents webpack from bundling pdf-parse,
  // so it loads from node_modules at runtime (test files exist there).
  serverExternalPackages: ['pdf-parse'],
  experimental: {
    // Legacy key kept for compatibility with older 14.x patch versions
    serverComponentsExternalPackages: ['pdf-parse'],
    // Increase max body size for PDF uploads (10MB)
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
