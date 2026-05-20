import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AUDITHEX_AGENT_ENDPOINT: z.string().url().optional(),
  AUDITHEX_AGENT_AUTH: z.string().optional(),
  AUDITHEX_AUTO_UPDATE_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  AUDITHEX_LLM_COST_CAP_USD: z
    .string()
    .default('1.00')
    .transform((v) => {
      const n = Number.parseFloat(v);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`AUDITHEX_LLM_COST_CAP_USD must be a non-negative number (got ${v})`);
      }
      return n;
    }),
  AUDITHEX_LOCALE: z.string().optional(),
  AUDITHEX_HOME: z.string().optional(),
  AUDITHEX_LOCALES_ROOT: z.string().optional(),
  AUDITHEX_RULES_PACK_URL: z.string().url().optional(),
});

export type AudithexEnv = z.infer<typeof schema>;

export function loadEnv(): AudithexEnv {
  loadDotenv({ override: false });
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
