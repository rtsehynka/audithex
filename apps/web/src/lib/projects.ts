import {
  createProject as repoCreate,
  deleteProject as repoDelete,
  getProjectById as repoGetById,
  getProjectByName as repoGetByName,
  listProjects as repoList,
  updateProject as repoUpdate,
} from '@audithex/core-persistence';
import type { Severity } from '@audithex/core-types';
import { getConnection } from './db';

/**
 * UI-facing shape for a Project. Mongoose `_id` is normalised to a
 * `string` and `createdAt` / `updatedAt` to ISO strings so React Server
 * Components can transit the record across the server/client boundary
 * without runtime objects.
 */
export interface ProjectView {
  id: string;
  name: string;
  rootPath: string;
  description: string | null;
  severityOverrides: Record<string, Severity>;
  disabledRuleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export async function listProjectsForUI(): Promise<ProjectView[]> {
  const conn = await getConnection();
  const docs = await repoList(conn);
  return docs.map(toView);
}

export async function getProjectForUI(id: string): Promise<ProjectView | null> {
  if (!isObjectIdLike(id)) return null;
  const conn = await getConnection();
  const doc = await repoGetById(conn, id);
  return doc ? toView(doc) : null;
}

export async function listProjectsIndexedByName(): Promise<Map<string, ProjectView>> {
  const list = await listProjectsForUI();
  const idx = new Map<string, ProjectView>();
  for (const p of list) idx.set(p.id, p);
  return idx;
}

export interface CreateProjectFromUiInput {
  name: string;
  rootPath: string;
  description: string | null;
  severityOverrides: Record<string, Severity>;
  disabledRuleIds: string[];
}

export async function createProjectFromUi(
  input: CreateProjectFromUiInput,
): Promise<
  { ok: true; project: ProjectView } | { ok: false; reason: 'duplicate' | 'error'; error?: string }
> {
  const conn = await getConnection();
  const existing = await repoGetByName(conn, input.name);
  if (existing) return { ok: false, reason: 'duplicate' };
  try {
    const created = await repoCreate(conn, input);
    return { ok: true, project: toView(created) };
  } catch (err) {
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateProjectFromUi(
  id: string,
  patch: Partial<CreateProjectFromUiInput>,
): Promise<ProjectView | null> {
  if (!isObjectIdLike(id)) return null;
  const conn = await getConnection();
  const updated = await repoUpdate(conn, id, patch);
  return updated ? toView(updated) : null;
}

export async function deleteProjectFromUi(id: string): Promise<boolean> {
  if (!isObjectIdLike(id)) return false;
  const conn = await getConnection();
  return repoDelete(conn, id);
}

function toView(doc: {
  _id?: unknown;
  name: string;
  rootPath: string;
  description?: string | null;
  severityOverrides?: Record<string, Severity>;
  disabledRuleIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}): ProjectView {
  return {
    id: String(doc._id ?? ''),
    name: doc.name,
    rootPath: doc.rootPath,
    description: doc.description ?? null,
    severityOverrides: doc.severityOverrides ?? {},
    disabledRuleIds: [...(doc.disabledRuleIds ?? [])],
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date(0).toISOString(),
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date(0).toISOString(),
  };
}

function isObjectIdLike(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}
