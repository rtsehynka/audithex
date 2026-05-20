# Audithex overview

Audithex is a local-first, read-only AI security audit tool for Node and TypeScript projects. It scans your codebase for issues mapped to the OWASP LLM Top 10 and reports findings in the terminal or as structured JSON/Markdown reports. It never modifies your code and never sends data outside your machine.

## Phase 1 surface

The current build ships these commands:

- `audithex scan [path]` walks the given directory, classifies discovered files, applies the bundled static rules, and prints a report. Exit code is 0 (clean), 1 (low/medium findings only), or 2 (high or critical findings).
- `audithex selftest` runs the rule engine end-to-end against the current working directory as a pipeline smoke test. Returns non-zero on failure.
- `audithex update` inspects the local rules-pack manifest and reports whether an update is available. Remote channel wiring lands in week 4.
- `audithex init` writes a default `.audithex/config.json` into the current project.
- `audithex version` prints the installed Audithex version.

## Configuration

Per-user environment variables are loaded from a local `.env` file via `dotenv` and validated with `zod`:

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` enable LLM-judge evals.
- `AUDITHEX_AGENT_ENDPOINT` and `AUDITHEX_AGENT_AUTH` configure the dynamic tester (week 5).
- `AUDITHEX_AUTO_UPDATE_CHECK` toggles the daily update check.
- `AUDITHEX_LLM_COST_CAP_USD` caps spend on LLM-judge calls per scan.
- `AUDITHEX_LOCALE` overrides the UI language (currently `en` and `uk`).
- `AUDITHEX_HOME` overrides the on-disk cache root (default `~/.audithex`).
- `AUDITHEX_LOCALES_ROOT` lets packaged builds point at an alternate locale bundle.
