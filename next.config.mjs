import { execSync } from 'child_process';

let commitHash = 'local';
try {
  commitHash = execSync('git rev-parse HEAD').toString().trim();
} catch {
  // not in a git repo or git unavailable
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling these — they load from node_modules at runtime
  serverExternalPackages: ['unpdf', 'xlsx'],
  experimental: {
    // Legacy key for older 14.x patch compatibility
    serverComponentsExternalPackages: ['unpdf', 'xlsx'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().split('T')[0],
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
};

export default nextConfig;
