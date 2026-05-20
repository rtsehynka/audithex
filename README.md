# Audithex

Read-only, local-first AI security audit for any LLM-using codebase. Maps every finding to the OWASP LLM Top 10.

Audithex is polyglot by design. Out of the box it ships native parsers for TypeScript/JavaScript and regex-based detectors that work across Python, PHP, Go, Java, Ruby and any other source language. An optional AI-fallback mode uses your own LLM API key to extract artifacts from files we don't yet parse natively. The set of scanned extensions and directories is configurable via environment variables and `.audithex/config.json`; in Phase 2 the same configuration is exposed in the local web UI.

> Status: pre-alpha, week 2 of the Phase 1 roadmap. Rules ship as JSON documents (Mongoose-compatible schema) so the same payload moves untouched from the bundled CLI pack to `~/.audithex/rules-pack/` after `audithex update` and into MongoDB for the Phase 2 UI.

---

## Prerequisites

Audithex runs on macOS, Linux, and Windows (WSL2 recommended). You need:

| Tool | Minimum | Notes |
|---|---|---|
| **Node.js** | 22 LTS | Older versions fail with `engines` warnings. Use `nvm` to manage versions. |
| **pnpm** | 9.15.0 | Installed automatically through `corepack` — do not install globally. |
| **Git** | any recent | Required for repository cloning and the future `audithex update` flow. |
| **Python 3** | optional | Only needed if you opt into the Presidio PII detector (week 5+). |

No database, no Docker, no Apple Developer cert. Everything runs out of a single Node process. The Phase 1 CLI keeps all on-disk state in plain JSON files under `~/.audithex/`.

---

## Install from source

The repository is a `pnpm` monorepo. From scratch on a fresh machine:

```bash
# 1. Get Node 22 with nvm (skip if already on Node 22)
nvm install 22
nvm use 22

# 2. Activate the pinned pnpm version via corepack
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 3. Clone and install
git clone git@github.com:audithex/audithex.git
cd audithex
pnpm install     # ≈30s on first run, < 1s on warm runs

# 4. Build all packages once (TypeScript -> dist/)
pnpm build

# 5. Verify everything is green
pnpm verify      # lint + typecheck + test + jscpd + docs:check + locales:check + stubs:check
```

The CLI executable lives at `apps/cli/bin/audithex.js` after `pnpm build`. There is no global install step yet; invoke the local binary directly during development.

---

## First scan

Point Audithex at a project folder. The scanner is read-only and never writes outside `.audithex/`:

```bash
# Scan the current repository
node apps/cli/bin/audithex.js scan .

# Scan a project elsewhere on disk
node apps/cli/bin/audithex.js scan ~/work/my-agent

# Machine-readable output for CI / scripts
node apps/cli/bin/audithex.js scan . --report json > audit.json
node apps/cli/bin/audithex.js scan . --report md   > audit.md
```

Exit codes are deterministic so CI pipelines can fail on critical findings:

| Code | Meaning |
|---|---|
| `0` | No findings. |
| `1` | Only low / medium findings. |
| `2` | At least one high or critical finding. |

### Other commands

```bash
node apps/cli/bin/audithex.js version          # print installed version
node apps/cli/bin/audithex.js init             # write .audithex/config.json in the current project
node apps/cli/bin/audithex.js update           # report installed rules-pack version (remote channel: week 4)
node apps/cli/bin/audithex.js selftest         # pipeline smoke against the current working directory
node apps/cli/bin/audithex.js --help           # full command listing
```

The UI language switches between English and Ukrainian:

```bash
AUDITHEX_LOCALE=uk node apps/cli/bin/audithex.js scan .
```

---

## API keys and environment variables

Audithex reads configuration from a local `.env` file (any project, including the one you scan). Nothing in this list is mandatory for a basic scan — the CLI runs end-to-end without a single key set. Keys unlock advanced features:

```env
# --- LLM-backed extractors and evals (all optional in Phase 1) --------------
# Provide one of the two; AI fallback and LLM-judge evals will use whichever exists.
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...

# --- Dynamic agent testing (week 5 feature, safe to set ahead of time) -------
AUDITHEX_AGENT_ENDPOINT=https://your-agent.example.com/api/chat
AUDITHEX_AGENT_AUTH=Bearer eyJhbGciOi...

# --- Cost guard for any LLM-using action (default: 1.00 USD) -----------------
AUDITHEX_LLM_COST_CAP_USD=1.00

# --- Update channel ----------------------------------------------------------
AUDITHEX_AUTO_UPDATE_CHECK=true       # daily HEAD request to the rules-pack channel

# --- Localisation and home overrides ----------------------------------------
AUDITHEX_LOCALE=en                    # en | uk
AUDITHEX_HOME=/Users/you/.audithex    # where downloaded rules / history live
AUDITHEX_LOCALES_ROOT=/abs/path       # only for packaged builds with relocated locales

# --- Extension allowlist / blocklist (planned for week 3) -------------------
# AUDITHEX_SCAN_INCLUDE='**/*.{ts,tsx,py,php}'
# AUDITHEX_SCAN_EXCLUDE='legacy/**,vendor/**'
```

The CLI validates the `.env` through a `zod` schema at startup. Malformed values fail fast with a readable error before any scan runs.

### What each key unlocks

| Variable | Required for | If absent |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | LLM-judge evals, AI fallback extractor, AI fix recommendations (Phase 2) | Audithex still runs every static rule and every regex-based extractor — only the LLM-backed features stay dormant. |
| `AUDITHEX_AGENT_ENDPOINT` + `AUDITHEX_AGENT_AUTH` | Dynamic prompt-injection testing against your own running agent (week 5) | Dynamic tester is disabled; static + extractor pipeline is unaffected. |
| `AUDITHEX_LLM_COST_CAP_USD` | Hard cap on per-scan LLM spend | Defaults to 1 USD. |
| `AUDITHEX_AUTO_UPDATE_CHECK` | Daily rules-pack version check | Defaults to enabled. Set `false` for offline / air-gapped environments. |
| `AUDITHEX_LOCALE` | UI language | Picks up `LANG` / `LC_ALL` else falls back to `en`. |
| `AUDITHEX_HOME` | Custom on-disk cache root | Defaults to `~/.audithex`. |

The CLI **never** sends data to a third party. The two LLM keys above are used only when you explicitly run an LLM-using action; even then, the request goes directly from your machine to the provider you chose.

---

## Per-project configuration: `.audithex/config.json`

Generate a project-level config with sensible defaults:

```bash
node apps/cli/bin/audithex.js init
```

This writes `.audithex/config.json` next to your code:

```json
{
  "schemaVersion": "0.1",
  "scan": {
    "includeGlobs": ["**/*.{ts,tsx,js,jsx,mjs,cjs,md,txt}"],
    "excludeGlobs": ["node_modules/**", "dist/**", "build/**", ".next/**"]
  },
  "rules": {
    "overrides": {}
  },
  "dynamic": {
    "enabled": false
  }
}
```

Override one rule's severity or disable it entirely:

```json
{
  "rules": {
    "overrides": {
      "R013": { "severity": "low" },
      "R019": { "disabled": true }
    }
  }
}
```

`.env` variables always take precedence over `.audithex/config.json`. The Phase 2 web UI edits the same file.

---

## How the rules pack works

The rules engine is data-driven. Out of the box Audithex ships:

- **10 rules** (`R001` – `R010`) covering OWASP LLM02, LLM06, LLM07, LLM08 (mapped to CWEs 22, 78, 79, 89, 94, 798, 918).
- **20 TruffleHog-style secret patterns** for OpenAI, Anthropic, Google, Cohere, Mistral, Hugging Face, Replicate, GitHub, GitLab, Slack, Discord, AWS, Stripe, Twilio, SendGrid.
- **Three rule engines**: `regex-in-code`, `regex-in-prompt`, `artifact-property`.

Rules live as plain JSON inside `packages/core-rules/rules-pack/` and ship with the npm package. After `audithex update` (remote channel lands in week 4), the latest pack is written to `~/.audithex/rules-pack/current/`. If a user pack exists it overrides the bundled one; otherwise the bundled pack is used. The schema matches Mongoose models exactly so the same documents move into MongoDB in Phase 2 without migration.

To preview which rules are loaded right now:

```bash
node apps/cli/bin/audithex.js scan . --report json | jq '.rulesVersion'
# e.g. "0.1.0 (bundled)"
```

---

## What this repo contains today

```
audithex/
├── apps/
│   └── cli/                   Node 22 CLI: commander, @clack/prompts, dotenv, zod, i18next
├── packages/
│   ├── core-languages         Central language registry (TS, JS, Python, PHP, Go, Java, Ruby, plain-text)
│   ├── core-discovery         gitignore-aware walker + 6 multi-language artifact extractors
│   ├── core-rules             JSON rules-pack engine + loader + 3 engines (regex-in-code, regex-in-prompt, artifact-property)
│   ├── core-report            Console / JSON / Markdown report renderers
│   ├── core-update            Rules-pack manifest reader + semver compare for the update channel
│   ├── core-eval-runner       Fixture evaluator with precision / recall thresholds
│   ├── core-payloads          Schema and loader for the attack payload library (week 5)
│   ├── core-i18n              i18next loader auto-resolving locales/ root, namespace-aware t()
│   └── core-types             Shared TypeScript types and the exit-code mapper
├── locales/{en,uk}/           UI strings, kept in parity by scripts/check-locale-parity.mjs
├── scripts/                   CI enforcement: check-docs, check-locale-parity, check-no-stubs
└── docs/overview.md           Authoritative overview (this README is the entry point)
```

---

## Quality gates

Every change must clear these before being marked complete. Run them locally; CI runs the same set on every PR.

```bash
pnpm verify        # lint + typecheck + test + jscpd + docs:check + locales:check + stubs:check
pnpm lint          # Biome
pnpm typecheck     # tsc per workspace
pnpm test          # Vitest (85 tests across 11 suites)
pnpm dupes         # jscpd (TypeScript-only, 0 clones allowed)
pnpm docs:check    # no TODO: placeholders in docs/
pnpm locales:check # locales/en and locales/uk in full key parity
pnpm stubs:check   # no "throw new Error('not implemented')" or "TODO: implement"
```

---

## Common workflows

```bash
# Watch one CLI command during development
pnpm --filter @audithex/cli dev -- scan ~/work/my-agent

# Run a single workspace's tests
pnpm --filter @audithex/core-rules test

# Verify only locales after editing a translation
pnpm locales:check

# Reset the rules-pack cache and force the bundled pack
rm -rf ~/.audithex/rules-pack && node apps/cli/bin/audithex.js scan .

# Switch language for a single command
AUDITHEX_LOCALE=uk node apps/cli/bin/audithex.js scan .
```

---

## Troubleshooting

**`Unsupported engine: wanted: {"node":">=22.0.0"} (current: "18.x")`**
You ran a command under the wrong Node. Run `nvm use 22` in the shell that invokes Audithex.

**`Cannot find matching keyid` from `corepack`**
The OS-bundled corepack on older Node ships with stale signing keys. Switch to Node 22 first; that version's corepack ships with current keys.

**`Cannot find module '@audithex/core-languages'` during typecheck**
A workspace package has not been built yet. Run `pnpm build` once.

**`Module ... was compiled against a different Node.js version`**
Native module from a previous Node install. Run `pnpm rebuild` while on Node 22.

**Scan reports no findings on a file you know is vulnerable**
Check that the file extension is registered. `node -e "import('@audithex/core-languages').then(m => console.log(m.listExtensions()))"` lists what the scanner accepts. To add an extension, edit the language definition in `packages/core-languages/src/languages/` — the registry is the single source of truth.

**`Invalid environment configuration`**
The `.env` failed `zod` validation. The error message lists the offending key and what was expected.

---

## Project plan

The durable execution plan lives at `.claude/PROJECT_PLAN.md`. The 12 engineering rules that govern every change live at the top of `CLAUDE.md`.

## License

AGPL-3.0-or-later. See `LICENSE` (added in week 5 packaging).
