/**
 * Intentionally-vulnerable LLM call site used by the selftest.
 *
 * Hits two new R0XX rules:
 *   - R011: raw `userInput` interpolated into a "system:" template
 *           without <user_input> boundary tags.
 *   - R015: anthropic.messages.create({...}) with no max_tokens cap.
 *
 * Banking-bot fixture file — every appearance is on-purpose.
 */
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function answerUser(userInput: string): Promise<string> {
  const prompt = `system: You are a helpful banking assistant. ${userInput} Please respond.`;
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: prompt }],
  });
  return JSON.stringify(response);
}
