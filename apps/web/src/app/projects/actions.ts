'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '../../lib/auth';
import { createProjectFromUi, deleteProjectFromUi, updateProjectFromUi } from '../../lib/projects';

const RULE_ID_PATTERN = /^R\d{3}$/;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type SeverityValue = (typeof SEVERITIES)[number];

const ProjectFormSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(64),
  rootPath: z.string().min(1, 'Root path is required.'),
  description: z.string().optional(),
  disabledRuleIds: z.string().optional(),
  severityOverrides: z.string().optional(),
});

export interface ProjectActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

interface ParsedProjectPayload {
  name: string;
  rootPath: string;
  description: string | null;
  disabledRuleIds: string[];
  severityOverrides: Record<string, SeverityValue>;
}

/**
 * Shared validate-then-normalise step for create + update. Returns
 * either a clean payload ready for the repository or a fieldErrors
 * dict shaped for the React form state. Centralising this is what
 * keeps jscpd happy across the two server actions.
 */
function parseProjectForm(
  formData: FormData,
): { ok: true; data: ParsedProjectPayload } | { ok: false; result: ProjectActionResult } {
  const parsed = ProjectFormSchema.safeParse({
    name: formData.get('name'),
    rootPath: formData.get('rootPath'),
    description: formData.get('description') ?? '',
    disabledRuleIds: formData.get('disabledRuleIds') ?? '',
    severityOverrides: formData.get('severityOverrides') ?? '',
  });
  if (!parsed.success) {
    return {
      ok: false,
      result: { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) },
    };
  }
  const ids = parseRuleIds(parsed.data.disabledRuleIds);
  if (ids === null) {
    return {
      ok: false,
      result: {
        ok: false,
        fieldErrors: { disabledRuleIds: 'Use comma-separated rule ids like R001,R002.' },
      },
    };
  }
  const overrides = parseSeverityOverrides(parsed.data.severityOverrides);
  if (overrides === null) {
    return {
      ok: false,
      result: {
        ok: false,
        fieldErrors: {
          severityOverrides:
            'Use lines like `R009=low` (one per line). Severity must be critical, high, medium, or low.',
        },
      },
    };
  }
  return {
    ok: true,
    data: {
      name: parsed.data.name.trim(),
      rootPath: parsed.data.rootPath.trim(),
      description: parsed.data.description?.trim() || null,
      disabledRuleIds: ids,
      severityOverrides: overrides,
    },
  };
}

export async function createProjectAction(
  _prev: unknown,
  formData: FormData,
): Promise<ProjectActionResult> {
  await requireSession();
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return parsed.result;

  const result = await createProjectFromUi(parsed.data);
  if (!result.ok) {
    if (result.reason === 'duplicate') {
      return { ok: false, fieldErrors: { name: 'A project with this name already exists.' } };
    }
    return { ok: false, error: result.error ?? 'Failed to create project.' };
  }
  revalidatePath('/projects');
  revalidatePath('/');
  redirect(`/projects/${result.project.id}`);
}

export async function updateProjectAction(
  id: string,
  _prev: unknown,
  formData: FormData,
): Promise<ProjectActionResult> {
  await requireSession();
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return parsed.result;

  const updated = await updateProjectFromUi(id, parsed.data);
  if (!updated) {
    return { ok: false, error: 'Project not found.' };
  }
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  revalidatePath('/');
  return { ok: true };
}

export async function deleteProjectAction(id: string): Promise<void> {
  await requireSession();
  await deleteProjectFromUi(id);
  revalidatePath('/projects');
  revalidatePath('/');
  redirect('/projects');
}

function collectFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

function parseRuleIds(raw: string | undefined): string[] | null {
  if (!raw) return [];
  const ids: string[] = [];
  for (const token of raw.split(/[,\s]+/)) {
    const trimmed = token.trim();
    if (trimmed.length === 0) continue;
    if (!RULE_ID_PATTERN.test(trimmed)) return null;
    ids.push(trimmed);
  }
  return ids;
}

function parseSeverityOverrides(raw: string | undefined): Record<string, SeverityValue> | null {
  if (!raw) return {};
  const out: Record<string, SeverityValue> = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [idRaw, severityRaw] = line.split('=', 2).map((s) => s.trim());
    if (!idRaw || !severityRaw) return null;
    if (!RULE_ID_PATTERN.test(idRaw)) return null;
    const severity = severityRaw.toLowerCase() as SeverityValue;
    if (!SEVERITIES.includes(severity)) return null;
    out[idRaw] = severity;
  }
  return out;
}
