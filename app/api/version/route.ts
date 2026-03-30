import { VERSION } from '@/lib/version';

export async function GET() {
  return Response.json({
    version: VERSION.number,
    buildTime: VERSION.buildTime,
    commitHash: VERSION.commitHash,
  });
}
