export const VERSION = {
  number: '0.3.0',
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || 'dev',
  commitHash: process.env.NEXT_PUBLIC_COMMIT_HASH || 'local',
};

export function getVersionString(): string {
  const hash = VERSION.commitHash === 'local' ? 'local' : VERSION.commitHash.slice(0, 7);
  return `v${VERSION.number} · ${hash} · ${VERSION.buildTime}`;
}
