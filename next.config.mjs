/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required for pdf-parse which uses Node.js APIs (Next.js 14 key)
    serverComponentsExternalPackages: ['pdf-parse'],
    // Increase max body size for PDF uploads (10MB)
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
