export { audithexHome, currentSymlinkPath, rulesPackRoot, versionDir } from './paths.js';
export { compareSemver, evaluateUpdate, type UpdateCheckResult } from './semver.js';
export { sha256Hex } from './checksum.js';
export { httpFetcher, type RemoteFetcher } from './fetcher.js';
export {
  DEFAULT_MANIFEST_URL,
  packUrlFromManifestUrl,
  readCurrentVersion,
  runUpdate,
  type RemoteRulesPackBody,
  type RunUpdateOptions,
  type UpdateOutcome,
} from './runner.js';
