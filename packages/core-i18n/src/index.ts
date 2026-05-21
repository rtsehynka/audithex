import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale } from '@audithex/core-types';
import i18next, { type Resource, type i18n } from 'i18next';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'uk'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

const NAMESPACES = [
  'common',
  'cli',
  'scan',
  'findings',
  'blocks',
  'update',
  'selftest',
  'history',
  'ui',
  'user',
  'project',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

function resolveLocalesRoot(): string {
  // Allow override for monorepo layouts / packaged builds.
  if (process.env.AUDITHEX_LOCALES_ROOT) {
    return process.env.AUDITHEX_LOCALES_ROOT;
  }
  // Walk up from this file until a directory containing `locales/` is found.
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(current, 'locales');
    try {
      if (statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // not here, walk up
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Audithex locales directory not found. Set AUDITHEX_LOCALES_ROOT.');
}

function loadResources(): Record<Locale, Record<Namespace, Record<string, unknown>>> {
  const root = resolveLocalesRoot();
  const result: Record<string, Record<string, Record<string, unknown>>> = {};
  const locales = readdirSync(root).filter((entry) => {
    return statSync(join(root, entry)).isDirectory();
  });
  for (const locale of locales) {
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) continue;
    const bundles: Record<string, Record<string, unknown>> = {};
    for (const namespace of NAMESPACES) {
      const file = join(root, locale, `${namespace}.json`);
      try {
        bundles[namespace] = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load locale file ${file}: ${message}`);
      }
    }
    result[locale] = bundles;
  }
  return result as Record<Locale, Record<Namespace, Record<string, unknown>>>;
}

let initialized: i18n | null = null;

export function pickLocale(requested?: string): Locale {
  if (requested && SUPPORTED_LOCALES.includes(requested as Locale)) {
    return requested as Locale;
  }
  const envLocale = process.env.AUDITHEX_LOCALE;
  if (envLocale && SUPPORTED_LOCALES.includes(envLocale as Locale)) {
    return envLocale as Locale;
  }
  const lang = process.env.LANG ?? process.env.LC_ALL ?? '';
  const prefix = lang.split(/[._-]/)[0]?.toLowerCase();
  if (prefix && SUPPORTED_LOCALES.includes(prefix as Locale)) {
    return prefix as Locale;
  }
  return DEFAULT_LOCALE;
}

export async function initI18n(requested?: string): Promise<i18n> {
  const locale = pickLocale(requested);
  const resources = loadResources();
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    ns: [...NAMESPACES],
    defaultNS: 'common',
    resources: resources as unknown as Resource,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
  initialized = instance;
  return instance;
}

export function t(key: string, params?: Record<string, string | number>): string {
  if (!initialized) {
    throw new Error('i18n is not initialized. Call initI18n() first.');
  }
  return initialized.t(key, params as Record<string, unknown>) as string;
}

export function getCurrentLocale(): Locale {
  if (!initialized) return DEFAULT_LOCALE;
  return (initialized.language as Locale) ?? DEFAULT_LOCALE;
}
