import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const SAVED = process.env;

describe('loadEnv', () => {
  beforeEach(() => {
    const next = { ...SAVED };
    next.ANTHROPIC_API_KEY = undefined as unknown as string;
    next.OPENAI_API_KEY = undefined as unknown as string;
    next.AUDITHEX_AGENT_ENDPOINT = undefined as unknown as string;
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AUDITHEX_AGENT_ENDPOINT']) {
      Reflect.deleteProperty(next, key);
    }
    process.env = next;
  });

  afterEach(() => {
    process.env = SAVED;
  });

  it('returns defaults when nothing is set', () => {
    const env = loadEnv();
    expect(env.AUDITHEX_AUTO_UPDATE_CHECK).toBe(true);
    expect(env.AUDITHEX_LLM_COST_CAP_USD).toBeCloseTo(1.0);
  });

  it('parses AUDITHEX_AUTO_UPDATE_CHECK=false', () => {
    process.env.AUDITHEX_AUTO_UPDATE_CHECK = 'false';
    const env = loadEnv();
    expect(env.AUDITHEX_AUTO_UPDATE_CHECK).toBe(false);
  });

  it('throws on a malformed agent endpoint URL', () => {
    process.env.AUDITHEX_AGENT_ENDPOINT = 'not-a-url';
    expect(() => loadEnv()).toThrow(/Invalid environment configuration/);
  });

  it('parses a numeric cost cap', () => {
    process.env.AUDITHEX_LLM_COST_CAP_USD = '2.50';
    const env = loadEnv();
    expect(env.AUDITHEX_LLM_COST_CAP_USD).toBeCloseTo(2.5);
  });
});
