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
  findUserByEmail,
  getScanRunById,
  listRulesPackUpdates,
  listScanRuns,
  logRulesPackUpdate,
  saveScanRun,
  type CreateUserInput,
  type ListScanRunsOptions,
  type LogRulesPackUpdateInput,
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
