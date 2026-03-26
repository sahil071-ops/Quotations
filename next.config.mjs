/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for pdf-parse which uses Node.js APIs
  serverExternalPackages: ['pdf-parse'],
  // Increase max body size for PDF uploads (10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
