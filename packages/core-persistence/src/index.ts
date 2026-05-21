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
  createProject,
  createUser,
  deleteProject,
  fingerprintScanResult,
  findAiFix,
  findUserByEmail,
  findUserById,
  getAiSettings,
  saveAiSettings,
  getProjectById,
  getProjectByName,
  getScanRunById,
  listAiFixesForScan,
  listProjects,
  listRulesPackUpdates,
  listScanRuns,
  logRulesPackUpdate,
  saveAiFix,
  saveScanRun,
  updateProject,
  updateUserEmail,
  updateUserPassword,
  type CreateProjectInput,
  type CreateUserInput,
  type ListScanRunsOptions,
  type LogRulesPackUpdateInput,
  type SaveAiFixInput,
  type SaveScanRunInput,
  type UpdateProjectInput,
  type UpdateUserResult,
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
export {
  getAiSettingsModel,
  type AiSettingsDocument,
  type LlmProviderKind,
} from './models/ai-settings.js';
export {
  getProjectModel,
  type DbDriver,
  type ProjectDbConnection,
  type ProjectDocument,
} from './models/project.js';
