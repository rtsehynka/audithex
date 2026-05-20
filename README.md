# Audithex

Read-only, local-first AI security audit for any LLM-using codebase. Maps every finding to the OWASP LLM Top 10.

Audithex is polyglot by design. Out of the box it ships native parsers for TypeScript/JavaScript and regex-based detectors that work across Python, PHP, Go, Java, Ruby and any other source language. An optional AI-fallback mode uses your own LLM API key to extract artifacts from files we don't yet parse natively. The set of scanned extensions and directories is configurable via environment variables and `.audithex/config.json`; in Phase 2 the same configuration is exposed in the local web UI.

> Status: pre-alpha, week 1 of the Phase 1 roadmap. The repository is a monorepo skeleton with real (non-stub) implementations of the scanner core and the CLI surface. Native TS/JS extractors land in week 2; Python and PHP detectors plus the AI-fallback shim land alongside them.

## Quickstart

```bash
nvm use 22
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm build

# CLI smoke
node apps/cli/bin/audithex.js version
node apps/cli/bin/audithex.js scan .
```

## What this repo contains today

- `apps/cli` — Node 22 CLI built with `commander`, `@clack/prompts`, `dotenv`, `zod`, and `i18next`.
- `packages/core-discovery` — synchronous directory walker that respects `.gitignore` and classifies files by extension.
- `packages/core-rules` — rule engine with the first real rule, `R001` (API key literal in source).
- `packages/core-payloads` — schema for the attack payload library (data loads in week 5).
- `packages/core-eval-runner` — fixture evaluator that drives the self-test command.
- `packages/core-report` — console, JSON, and Markdown report renderers.
- `packages/core-update` — local rules-pack manifest reader plus semver comparison.
- `packages/core-i18n` — `i18next` setup that loads `locales/en` and `locales/uk`.
- `packages/core-types` — shared TypeScript types and the exit-code mapper.
- `locales/{en,uk}` — UI strings, kept in parity by `scripts/check-locale-parity.mjs`.

## Quality gates

Run them locally or in CI:

```bash
pnpm verify     # lint + typecheck + test + jscpd + docs:check + locales:check + stubs:check
pnpm lint       # Biome
pnpm typecheck  # tsc -p per workspace
pnpm test       # Vitest
pnpm dupes      # jscpd
pnpm docs:check
pnpm locales:check
pnpm stubs:check
```

## Project plan

The durable execution plan lives at `.claude/PROJECT_PLAN.md`. The 12 engineering rules that govern every change live at the top of `CLAUDE.md`.

## License

AGPL-3.0-or-later. See `LICENSE` (added in week 5 packaging).
