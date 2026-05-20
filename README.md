# Audithex

Read-only, local-first AI security audit for any LLM-using codebase. Maps every finding to the OWASP LLM Top 10.

Audithex reads your code, finds problems, and reports them. It never modifies user code, never auto-fixes, and never sends data to a third party. Output is always a notification: "here is a problem, here is how to fix it."

The scanner is polyglot. It ships native TypeScript Compiler API parsers for `.ts/.tsx/.js/.jsx/.mjs/.cjs` and regex-based detectors for Python, PHP, Go, Java, and Ruby. Standalone prompt files (`.md/.txt`) are also recognised. The set of extensions, languages, ignored directories, and rule severities is controlled from `.env` and `.audithex/config.json` — never hard-coded inside the scanner.

---

## What you get out of the box

- **CLI commands:** `scan`, `update`, `selftest`, `init`, `version`
- **10 rules (R001 – R010)** covering OWASP LLM02, LLM06, LLM07, LLM08, mapped to CWE-22, 78, 79, 89, 94, 798, 918
- **20 secret patterns** for OpenAI, Anthropic, Google, Cohere, Mistral, Hugging Face, Replicate, GitHub, GitLab, Slack, Discord, AWS, Stripe, Twilio, SendGrid
- **3 rule engines:** `regex-in-code`, `regex-in-prompt`, `artifact-property`
- **6 extractors:** SDK imports, model strings, system prompts, tool definitions, RAG config, secret candidates
- **AST-confidence detection** for `.ts/.tsx/.js/.jsx/.mjs/.cjs` (SDK imports, tool literals, code-embedded system prompts); regex-confidence for every other language
- **Self-evaluating engine** with a `fixture-banking-bot` ground-truth fixture (10 expected findings, precision ≥ 0.95, recall ≥ 0.9)
- **Git-based rules-pack update channel** with `git pull --ff-only` and `git reset --hard` rollback when the new pack's selftest fails
- **Console, JSON, and Markdown reports** with deterministic CI exit codes
- **English and Ukrainian UI** in full key parity
- **0 jscpd code-clone duplication** enforced in CI

---

## Prerequisites

Audithex runs on macOS, Linux, and Windows (WSL2 recommended).

| Tool | Minimum | Notes |
|---|---|---|
| **Node.js** | 22 LTS | `engines` field enforces it. Use `nvm` to manage versions. |
| **yarn** | 4.13.0 | Activated through `corepack` — do not install globally. |
| **git** | any recent | Required for clone and for the rules-pack update channel. |

No database, no Docker, no native build step. All on-disk state lives in plain files under `~/.audithex/`.

---

## Install from source

```bash
# 1. Activate Node 22 (skip if already on it)
nvm install 22
nvm use 22

# 2. Activate the pinned yarn through corepack
corepack enable
corepack prepare yarn@4.13.0 --activate

# 3. Clone and install
git clone git@github.com:rtsehynka/audithex.git
cd audithex
yarn install                # ≈10s warm, ≈30s on a fresh machine

# 4. Build all packages (TypeScript → dist/)
yarn build

# 5. Run all quality gates
yarn verify                 # lint + typecheck + test + jscpd + docs + locales + stubs
```

The CLI executable lives at `apps/cli/bin/audithex.js` after `yarn build`. Invoke it directly during development. A `yarn link` step to expose `audithex` as a global binary is intentionally omitted to avoid polluting the global node_modules.

---

## Configure via `.env`

Copy `.env.example` to `.env` at the root of any project you scan. Everything in `.env` is optional — a basic `scan` runs end-to-end without a single key set. The CLI validates `.env` with a `zod` schema at startup and fails fast on malformed values.

```bash
cp .env.example .env
```

Variables Audithex understands:

| Variable | What it unlocks | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | LLM-judge evals and AI-fallback extractor (when wired in your project) | unset |
| `OPENAI_API_KEY` | Same as above, alternate provider | unset |
| `AUDITHEX_AGENT_ENDPOINT` | URL of a running agent the dynamic tester can hit | unset |
| `AUDITHEX_AGENT_AUTH` | `Authorization` header for the above endpoint | unset |
| `AUDITHEX_LLM_COST_CAP_USD` | Hard cap on per-scan LLM spend in USD | `1.00` |
| `AUDITHEX_AUTO_UPDATE_CHECK` | Daily HEAD probe to the rules-pack channel | `true` |
| `AUDITHEX_LOCALE` | UI language (`en` or `uk`) | derived from `LANG`/`LC_ALL`, falls back to `en` |
| `AUDITHEX_HOME` | Root for cached rules-pack, selftest history, etc. | `~/.audithex` |
| `AUDITHEX_LOCALES_ROOT` | Absolute path to the locales directory (packaged builds only) | walked up from the package's install location |
| `AUDITHEX_RULES_PACK_URL` | Git URL the `update` command clones / pulls from | `https://github.com/audithex/rules-pack.git` |

Audithex **never** sends data to a third party. The two LLM keys above are used only when you explicitly run an LLM-using action; the request then goes straight from your machine to the provider you chose.

---

## Run your first scan

The scanner is read-only. The only directory it ever writes to is `.audithex/` inside the project it scans, and only when you invoke `init`.

```bash
# Scan the audithex repo itself
node apps/cli/bin/audithex.js scan .

# Scan a project elsewhere on disk
node apps/cli/bin/audithex.js scan ~/work/my-agent

# Machine-readable output for CI or scripting
node apps/cli/bin/audithex.js scan . --report json > audit.json
node apps/cli/bin/audithex.js scan . --report md   > audit.md

# Filter findings by severity (default prints all)
node apps/cli/bin/audithex.js scan . --severity critical

# Switch language for one invocation
AUDITHEX_LOCALE=uk node apps/cli/bin/audithex.js scan .
```

The exit code is deterministic so CI can fail on critical findings:

| Code | Meaning |
|---|---|
| `0` | No findings. |
| `1` | Only low / medium findings. |
| `2` | At least one high or critical finding. |

### What a console report looks like

```
Audithex Scan Report
Project root: /Users/you/work/my-agent
Scanned: 247 files in 142 ms
Rules version: 0.1.0 (bundled)

CRITICAL (2)
  R001  Hardcoded OpenAI key literal in source        src/agent.ts:4:21
  R005  eval() called on LLM output                   src/agent.ts:8:10

HIGH (3)
  R003  Tool 'transfer_funds' has no description      tools/anthropic-tools.json:4:5
  R006  fs.writeFileSync with interpolated path       src/tools/database.ts:11:3
  R008  fetch() with interpolated URL (SSRF surface)  src/tools/http.ts:3:10

MEDIUM (0)  LOW (0)
```

The same scan with `--report json` produces a stable JSON shape suitable for diffing across scans (`location`, `messageKey`, `messageParams`, `fixKey`, `severity`, `owasp`, `cwe`, `rulesVersion`, `audithexVersion`, `elapsedMs`).

---

## Update the rules pack

Audithex tracks an external rules-pack repository as a plain git checkout under `~/.audithex/rules-pack/current/`. `git pull` is the integrity gate — commit SHAs and (optionally) signed tags raise it.

```bash
# Interactive (prompts before applying)
node apps/cli/bin/audithex.js update

# CI-safe (skips the confirmation prompt)
node apps/cli/bin/audithex.js update --yes

# Use a custom rules-pack channel (any git URL — including file://)
AUDITHEX_RULES_PACK_URL=file:///path/to/my-rules.git \
  node apps/cli/bin/audithex.js update --yes
```

Possible outcomes:

| Outcome | What happened on disk |
|---|---|
| `up-to-date` | `~/.audithex/rules-pack/current` is at the same commit as the remote `HEAD`. |
| `installed` | First-ever `git clone --depth 1` or successful `git pull --ff-only`. |
| `rolled-back` | New checkout failed the post-update selftest. `git reset --hard <previous-HEAD>` reverted the tree. First-ever clones that fail selftest are wiped. |
| `fetch-failed` | Network error, bad URL, or non-fast-forward. The working tree is untouched. |

Setting `AUDITHEX_AUTO_UPDATE_CHECK=false` disables the daily silent HEAD probe `scan` makes; offline / air-gapped environments should set this.

---

## Run the self-evaluating engine

`selftest` runs the full pipeline against the bundled `fixtures/fixture-banking-bot/` (intentionally-vulnerable banking chatbot) and asserts the result against `expected-findings.json` (10 ground-truth findings, one per rule R001 – R010).

```bash
# Run every bundled fixture (currently: fixture-banking-bot)
node apps/cli/bin/audithex.js selftest

# Run a specific fixture by directory name
node apps/cli/bin/audithex.js selftest --fixture fixture-banking-bot

# Point at a custom fixtures directory
node apps/cli/bin/audithex.js selftest --fixture-root /path/to/custom-fixtures
```

A passing run prints:

```
fixture-banking-bot: PASS (tp=10 fp=0 fn=0 precision=1.00 recall=1.00)
selftest: PASS across 1 fixture(s) — thresholds precision>=0.95, recall>=0.90
```

The exit code is `0` when every fixture clears `precision ≥ 0.95` and `recall ≥ 0.9`, and `2` otherwise. `update` runs the same selftest on every freshly-installed rules pack and rolls back when it fails.

---

## Per-project configuration

`audithex init` writes `.audithex/config.json` next to your code:

```bash
node apps/cli/bin/audithex.js init
```

Default contents:

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
      "R009": { "severity": "low" },
      "R010": { "disabled": true }
    }
  }
}
```

`.env` values take precedence over `.audithex/config.json`.

---

## What's in this repo

```
audithex/
├── apps/
│   └── cli/                   Node 22 CLI: commander, @clack/prompts, dotenv, zod, i18next
├── packages/
│   ├── core-languages         Central language registry (TS, JS, Python, PHP, Go, Java, Ruby, plain-text)
│   ├── core-discovery         gitignore-aware walker + 6 multi-language artifact extractors
│   │                          (TS Compiler API on .ts/.tsx/.js/.jsx/.mjs/.cjs, regex elsewhere)
│   ├── core-rules             JSON rules-pack engine + loader + 3 engines
│   ├── core-report            Console / JSON / Markdown report renderers
│   ├── core-update            Git-based rules-pack update channel + selftest rollback
│   ├── core-eval-runner       Fixture evaluator + bundled-fixtures loader (precision / recall thresholds)
│   ├── core-payloads          Schema and loader for the attack payload library
│   ├── core-i18n              i18next loader auto-resolving locales/ root, namespace-aware t()
│   └── core-types             Shared TypeScript types and the exit-code mapper
├── fixtures/
│   └── fixture-banking-bot/   Intentionally-vulnerable code + expected-findings.json (selftest ground truth)
├── locales/{en,uk}/           UI strings, kept in parity by scripts/check-locale-parity.mjs
├── scripts/                   CI enforcement: check-docs, check-locale-parity, check-no-stubs
└── docs/overview.md           Authoritative architecture overview
```

---

## Quality gates

Every change must clear all of these. `yarn verify` runs them in one go; CI runs the same set on every PR.

```bash
yarn verify        # lint + typecheck + test + jscpd + docs + locales + stubs (in that order)

yarn lint          # Biome
yarn typecheck     # tsc per workspace
yarn test          # Vitest across every workspace
yarn dupes         # jscpd (TypeScript-only, 0 clones allowed)
yarn docs:check    # no TODO: placeholders inside docs/
yarn locales:check # locales/en and locales/uk in full key parity
yarn stubs:check   # no "throw new Error('not implemented')" or "TODO: implement"
```

Test count by workspace:

| Workspace | Tests |
|---|---|
| `@audithex/core-discovery` | 35 (+ 1 perf benchmark gated by `AUDITHEX_RUN_PERF_BENCH=true`) |
| `@audithex/core-rules` | 15 |
| `@audithex/core-update` | 13 |
| `@audithex/cli` | 5 (incl. end-to-end banking-bot selftest) |
| `@audithex/core-i18n` | 7 |
| `@audithex/core-report` | 3 |
| `@audithex/core-eval-runner` | 3 |

---

## Performance benchmark

A gated perf test under `packages/core-discovery/src/perf.bench.test.ts` generates 5 000 synthetic `.ts` files (1 in 50 enriched with SDK imports + model literals + system prompts + tool definitions) and asserts that `discover()` finishes in under 30 s.

```bash
AUDITHEX_RUN_PERF_BENCH=true \
  npx vitest run --root packages/core-discovery --dir packages/core-discovery/src
```

Reference run on an M2 MacBook Pro: **547 ms for 5 000 files, 300 artifacts**.

---

## Common workflows

```bash
# Run the CLI in watch mode (recompiles on every save)
yarn workspace @audithex/cli dev

# Run a single workspace's tests
yarn workspace @audithex/core-rules test

# Check locale parity after editing translations
yarn locales:check

# Reset the rules-pack cache and fall back to the bundled pack
rm -rf ~/.audithex/rules-pack
node apps/cli/bin/audithex.js scan .

# Use a local file:// rules-pack for development
AUDITHEX_RULES_PACK_URL=file:///path/to/my-rules.git \
  node apps/cli/bin/audithex.js update --yes
```

---

## Troubleshooting

**`Unsupported engine: wanted: {"node":">=22.0.0"} (current: "18.x")`**
Wrong Node version. Run `nvm use 22` in the shell that invokes Audithex.

**`Cannot find matching keyid` from `corepack`**
The OS-bundled corepack on older Node ships with stale signing keys. Switch to Node 22; that version's corepack ships with current keys.

**`The nearest package directory doesn't seem to be part of the project declared in ...`**
yarn 4 sees a parent `package.json` and assumes audithex must be a workspace of it. The repo's `yarn.lock` is the official escape hatch; if it ever gets deleted, run `touch yarn.lock` at the repo root and try again.

**`Cannot find module '@audithex/core-languages'` during typecheck**
A workspace package has not been built yet. Run `yarn build` once.

**`Module ... was compiled against a different Node.js version`**
A native module was built against an older Node. Run `yarn rebuild` while on Node 22.

**Scan reports no findings on a file you know is vulnerable**
Check that the file extension is registered. `node -e "import('@audithex/core-languages').then(m => console.log(m.listExtensions()))"` lists what the scanner accepts. To add an extension, edit the language definition in `packages/core-languages/src/languages/` — the registry is the single source of truth.

**`Failed to fetch rules pack: ... HTTP 404 Not Found` from `audithex update`**
The default channel URL (`https://github.com/audithex/rules-pack.git`) points at a repository that may not yet exist. Set `AUDITHEX_RULES_PACK_URL` to any git URL — a public mirror, a private fork, or a local `file://` path during development.

**`Invalid environment configuration`**
The `.env` failed `zod` validation. The error message lists the offending key and what was expected.

---

## License

AGPL-3.0-or-later.
