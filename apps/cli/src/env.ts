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
  MONGODB_URI: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
    z
      .string()
      .min(1)
      .optional()
      .refine(
        (v) => v === undefined || v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
        { message: 'MONGODB_URI must start with mongodb:// or mongodb+srv://' },
      ),
  ),
  AUDITHEX_UI_SESSION_SECRET: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
    z.string().min(32).optional(),
  ),
  AUDITHEX_UI_PORT: z
    .string()
    .default('7777')
    .transform((v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0 || n > 65_535) return 7777;
      return n;
    }),
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
