import type { Provider } from './provider.js';

/**
 * Single source of truth for a programming language Audithex can scan.
 *
 * Each language is registered exactly once in `src/languages/<id>.ts` and
 * surfaced through the registry. Rules, extractors and the file walker
 * MUST query the registry; hardcoding an extension list in another module
 * is a DRY violation enforced by the dedupe gate.
 */
export interface LanguageDefinition {
  /** Stable machine id (kebab-case). */
  id: string;
  /** Human-readable name. */
  displayName: string;
  /** Lowercase file extensions including the leading dot (e.g. ".ts"). */
  extensions: readonly string[];
  /** Capability hints used by extractors to pick a parsing strategy. */
  capabilities: LanguageCapabilities;
  /**
   * Comment prefixes the language recognises for the start of a line.
   * Used by rules that need to skip comments to avoid false positives.
   */
  lineCommentPrefixes: readonly string[];
  /**
   * Patterns matching idiomatic SDK / provider imports for this language.
   * Lets extractors map a file to a Provider with a single regex pass.
   */
  sdkImportPatterns: readonly SdkImportPattern[];
  /**
   * Regex patterns for code-embedded system prompts. Each pattern MUST
   * use a single capture group whose group 1 is the prompt body text.
   * Languages whose preferredParser is 'ts-compiler' leave this empty
   * because the extractor uses the AST instead.
   */
  systemPromptKwargPatterns?: readonly RegExp[];
}

export interface LanguageCapabilities {
  /** Best-available parser strategy for this language inside Audithex. */
  preferredParser: 'ts-compiler' | 'regex';
  /** True if file content should be scanned as code at all (false for plain text). */
  scansAsCode: boolean;
}

export interface SdkImportPattern {
  /** Provider the matched import binds to. */
  provider: Provider;
  /**
   * Regex applied to file content. MUST be multi-line safe and case
   * sensitive unless documented otherwise. Capture group 1, when present,
   * is treated as the imported symbol or module path for the artifact.
   */
  regex: RegExp;
  /**
   * Optional regex matched against a bare module specifier string
   * (e.g. `@anthropic-ai/sdk`, not the surrounding `from '…'` syntax).
   * Used by the TypeScript Compiler API extractor pass, which sees
   * module paths directly. Languages whose preferredParser is `regex`
   * leave this blank.
   */
  modulePattern?: RegExp;
}
