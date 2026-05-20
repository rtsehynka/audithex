import { z } from 'zod';

/**
 * Environment contract for the local web UI server. The CLI's
 * `audithex ui` command validates the same keys via a thin wrapper —
 * both surfaces use this single schema so a misconfiguration surfaces
 * identically whether you boot through `next start` or the CLI.
 */
const schema = z.object({
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required to run the web UI.')
    .refine(
      (v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    ),
  AUDITHEX_UI_SESSION_SECRET: z
    .string()
    .min(32, 'AUDITHEX_UI_SESSION_SECRET must be at least 32 characters.'),
  AUDITHEX_UI_SESSION_TTL_SECONDS: z
    .string()
    .default('86400')
    .transform((v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('AUDITHEX_UI_SESSION_TTL_SECONDS must be a positive integer.');
      }
      return n;
    }),
});

export type WebEnv = z.infer<typeof schema>;

let cached: WebEnv | null = null;

export function loadWebEnv(): WebEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid web environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
