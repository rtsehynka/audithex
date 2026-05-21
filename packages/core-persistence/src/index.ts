export {
  connectMongo,
  disconnectAll,
  disconnectMongo,
  type ConnectOptions,
} from './connect.js';
export { hashPassword, verifyPassword } from './auth.js';
export {
  computeTopSeverity,
  countScanRuns,
  createUser,
  fingerprintScanResult,
  findAiFix,
  findUserByEmail,
  getScanRunById,
  listAiFixesForScan,
  listRulesPackUpdates,
  listScanRuns,
  logRulesPackUpdate,
  saveAiFix,
  saveScanRun,
  type CreateUserInput,
  type ListScanRunsOptions,
  type LogRulesPackUpdateInput,
  type SaveAiFixInput,
  type SaveScanRunInput,
} from './repository.js';
export {
  getScanRunModel,
  type ScanRunDocument,
} from './models/scan-run.js';
export {
  getUserModel,
  type UserDocument,
} from './models/user.js';
export {
  getRulesPackUpdateModel,
  type RulesPackUpdateDocument,
  type UpdateOutcomeKind,
} from './models/rules-pack-update.js';
export {
  getAiFixModel,
  type AiFixDocument,
  type LlmProvider,
} from './models/ai-fix.js';
