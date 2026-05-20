# fixture-banking-bot

Intentionally vulnerable banking chatbot used by `audithex selftest`. Do not deploy.

The fixture exercises rules R001 through R010. The exact rule-to-line
mapping is the single source of truth for the self-evaluating engine
and lives in `expected-findings.json`.

If you add a new vulnerable construct, update that JSON in the same
change. The selftest gate verifies precision and recall against this
ground truth, so a stale fixture fails `audithex selftest`.
