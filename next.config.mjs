import { execSync } from 'child_process';

let commitHash = 'local';
try {
  commitHash = execSync('git rev-parse HEAD').toString().trim();
} catch {
  // not in a git repo or git unavailable
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverExternalPackages: ['unpdf', 'xlsx'],
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
