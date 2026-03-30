import { getVersionString } from '@/lib/version';

export function VersionBadge() {
  return (
    <span className="select-none font-mono text-xs text-gray-400">
      {getVersionString()}
    </span>
  );
}
