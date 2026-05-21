import { afterEach, describe, expect, it } from 'vitest';
import { getProjectModel } from './models/project.js';
import {
  createProject,
  deleteProject,
  getProjectById,
  getProjectByName,
  listProjects,
  updateProject,
} from './repository.js';
import { setupMongoFixture } from './test-helpers/mongo-fixture.js';

const { getConn } = setupMongoFixture();

afterEach(async () => {
  await getProjectModel(getConn()).deleteMany({});
});

describe('Project CRUD', () => {
  it('creates a project with defaults and lists it back', async () => {
    const created = await createProject(getConn(), {
      name: 'banking-bot',
      rootPath: '/abs/path/to/banking-bot',
    });
    expect(created.name).toBe('banking-bot');
    expect(created.disabledRuleIds).toEqual([]);
    expect(created.severityOverrides).toEqual({});

    const list = await listProjects(getConn());
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('banking-bot');
  });

  it('rejects duplicate names', async () => {
    await createProject(getConn(), { name: 'dup', rootPath: '/a' });
    await expect(createProject(getConn(), { name: 'dup', rootPath: '/b' })).rejects.toThrow();
  });

  it('round-trips by id and by name', async () => {
    const created = await createProject(getConn(), {
      name: 'roundtrip',
      rootPath: '/here',
      description: 'a sample',
      severityOverrides: { R009: 'low' },
      disabledRuleIds: ['R013'],
    });
    const byId = await getProjectById(getConn(), String(created._id));
    const byName = await getProjectByName(getConn(), 'roundtrip');
    expect(byId?.description).toBe('a sample');
    expect(byName?.severityOverrides).toEqual({ R009: 'low' });
    expect(byId?.disabledRuleIds).toEqual(['R013']);
  });

  it('updates fields and bumps updatedAt', async () => {
    const created = await createProject(getConn(), { name: 'mut', rootPath: '/x' });
    const before = created.updatedAt;
    await new Promise((res) => setTimeout(res, 10));
    const updated = await updateProject(getConn(), String(created._id), {
      description: 'tweaked',
      disabledRuleIds: ['R020'],
    });
    expect(updated?.description).toBe('tweaked');
    expect(updated?.disabledRuleIds).toEqual(['R020']);
    if (before && updated?.updatedAt) {
      expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    }
  });

  it('deletes a project by id', async () => {
    const created = await createProject(getConn(), { name: 'goodbye', rootPath: '/y' });
    const removed = await deleteProject(getConn(), String(created._id));
    expect(removed).toBe(true);
    expect(await listProjects(getConn())).toHaveLength(0);
    const missAgain = await deleteProject(getConn(), String(created._id));
    expect(missAgain).toBe(false);
  });
});
