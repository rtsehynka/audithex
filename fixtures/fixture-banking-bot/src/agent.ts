import { execSync } from 'node:child_process';

// Intentionally vulnerable: hardcoded OpenAI key (triggers R001).
const OPENAI_KEY = 'sk-Fixt0reBank1ngBotApiKeyForR001AB';

export async function evaluatePayload(payload: string): Promise<unknown> {
  // Intentionally vulnerable: dynamic code execution (triggers R005).
  return eval(payload);
}

export function shellLookup(account: string): string {
  // Intentionally vulnerable: shell command from interpolated input (triggers R007).
  return execSync(`whoami --account ${account}`).toString();
}

export function getKey(): string {
  return OPENAI_KEY;
}
