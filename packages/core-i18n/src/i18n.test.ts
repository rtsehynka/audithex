import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, initI18n, pickLocale, t } from './index.js';

describe('pickLocale', () => {
  it('returns DEFAULT_LOCALE when input is undefined', () => {
    Reflect.deleteProperty(process.env, 'AUDITHEX_LOCALE');
    expect(pickLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('returns the requested locale when supported', () => {
    expect(pickLocale('uk')).toBe('uk');
    expect(pickLocale('en')).toBe('en');
  });

  it('falls back to default for unsupported locale', () => {
    expect(pickLocale('fr')).toBe(DEFAULT_LOCALE);
  });
});

describe('initI18n + t', () => {
  it('loads English bundles and translates a known key', async () => {
    await initI18n('en');
    expect(t('app.name')).toBe('Audithex');
  });

  it('loads Ukrainian bundles when requested', async () => {
    await initI18n('uk');
    expect(t('app.tagline')).toContain('Node/TypeScript');
  });

  it('interpolates parameters', async () => {
    await initI18n('en');
    expect(t('errors.pathNotFound', { path: '/tmp/x' })).toBe('Path does not exist: /tmp/x');
  });
});

describe('SUPPORTED_LOCALES', () => {
  it('always contains the default locale', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  });
});
