# Audithex overview

Audithex is a local-first, read-only AI security audit tool for any LLM-using codebase. It is polyglot by design: native parsers cover TypeScript and JavaScript, regex-based detectors cover Python, PHP and any other source language we encounter, and an optional AI-fallback mode uses your own LLM API key to extract artifacts from files we don't yet parse natively.

Audithex scans your codebase for issues mapped to the OWASP LLM Top 10 and reports findings in the terminal or as structured JSON/Markdown reports. It never modifies your code. It never sends data outside your machine unless you explicitly enable the AI fallback, and even then only your own API key (Anthropic or OpenAI) is used.

## Phase 1 surface

The current build ships these commands:

- `audithex scan [path]` walks the given directory, classifies discovered files, applies the bundled static rules, and prints a report. Exit code is 0 (clean), 1 (low/medium findings only), or 2 (high or critical findings).
- `audithex selftest` runs the rule engine end-to-end against the current working directory as a pipeline smoke test. Returns non-zero on failure.
- `audithex update` inspects the local rules-pack manifest and reports whether an update is available. Remote channel wiring lands in week 4.
- `audithex init` writes a default `.audithex/config.json` into the current project.
- `audithex version` prints the installed Audithex version.

## Configuration

Per-user environment variables are loaded from a local `.env` file via `dotenv` and validated with `zod`:

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` enable LLM-judge evals and the optional AI fallback extractor.
- `AUDITHEX_AGENT_ENDPOINT` and `AUDITHEX_AGENT_AUTH` configure the dynamic tester (week 5).
- `AUDITHEX_AUTO_UPDATE_CHECK` toggles the daily update check.
- `AUDITHEX_LLM_COST_CAP_USD` caps spend on LLM-judge calls per scan.
- `AUDITHEX_LOCALE` overrides the UI language (currently `en` and `uk`).
- `AUDITHEX_HOME` overrides the on-disk cache root (default `~/.audithex`).
- `AUDITHEX_LOCALES_ROOT` lets packaged builds point at an alternate locale bundle.
- `AUDITHEX_SCAN_INCLUDE` overrides the scanned extension allowlist (comma-separated globs).
- `AUDITHEX_SCAN_EXCLUDE` adds extra ignore globs on top of `.gitignore`.
- `AUDITHEX_AI_EXTRACTION` (`true`/`false`) enables the AI-fallback extractor; uses the LLM key already in env.

A project may also pin its own `.audithex/config.json` (created by `audithex init`) which takes precedence over the defaults but is still overridable by env.
