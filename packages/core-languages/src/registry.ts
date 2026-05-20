import { go } from './languages/go.js';
import { java } from './languages/java.js';
import { javascript } from './languages/javascript.js';
import { php } from './languages/php.js';
import { plainText } from './languages/plain-text.js';
import { python } from './languages/python.js';
import { ruby } from './languages/ruby.js';
import { typescript } from './languages/typescript.js';
import type { LanguageDefinition } from './types.js';

/**
 * Frozen array of every language Audithex supports out of the box.
 * Order is meaningful: when an extension is claimed by multiple
 * languages the first match wins. Keep code-bearing languages above
 * plain-text so a `.yaml` does not capture a Python file by accident.
 */
const BUILTIN_LANGUAGES: readonly LanguageDefinition[] = Object.freeze([
  typescript,
  javascript,
  python,
  php,
  go,
  java,
  ruby,
  plainText,
]);

const EXTENSION_INDEX: ReadonlyMap<string, LanguageDefinition> = (() => {
  const map = new Map<string, LanguageDefinition>();
  for (const lang of BUILTIN_LANGUAGES) {
    for (const ext of lang.extensions) {
      const normalized = ext.toLowerCase();
      if (!map.has(normalized)) {
        map.set(normalized, lang);
      }
    }
  }
  return map;
})();

const ID_INDEX: ReadonlyMap<string, LanguageDefinition> = new Map(
  BUILTIN_LANGUAGES.map((lang) => [lang.id, lang]),
);

export function listLanguages(): readonly LanguageDefinition[] {
  return BUILTIN_LANGUAGES;
}

export function listExtensions(): readonly string[] {
  return [...EXTENSION_INDEX.keys()];
}

export function listCodeExtensions(): readonly string[] {
  const out: string[] = [];
  for (const lang of BUILTIN_LANGUAGES) {
    if (!lang.capabilities.scansAsCode) continue;
    for (const ext of lang.extensions) {
      out.push(ext.toLowerCase());
    }
  }
  return out;
}

export function getLanguageById(id: string): LanguageDefinition | undefined {
  return ID_INDEX.get(id);
}

export function getLanguageForExtension(extension: string): LanguageDefinition | undefined {
  return EXTENSION_INDEX.get(extension.toLowerCase());
}

export function getLanguageForFile(path: string): LanguageDefinition | undefined {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return undefined;
  return getLanguageForExtension(path.slice(dot));
}

export function isScannableFile(path: string): boolean {
  return getLanguageForFile(path) !== undefined;
}

export function isCodeFile(path: string): boolean {
  return getLanguageForFile(path)?.capabilities.scansAsCode ?? false;
}
