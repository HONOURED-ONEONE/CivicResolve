# MVP Acceptance Checklist

This document is the official tracker for the CivicResolve MVP implementation.

## How to use this checklist
- Update the checkmarks (`[x]`) as tasks are completed and merged to `feature/mvp-2026-03`.
- Reference specific checklist items in your pull request titles and commit messages.
- No new features can be requested until this checklist is 100% complete.

## Acceptance Criteria
- [ ] Gate accepts SIGNAL_INPUT_JSON and classifies Action/Draft/Reject.
- [ ] Intelligence Service exposes `/cluster` and `/pack` (JSON+PDF artifact saved; URL returned).
- [ ] Orchestrator flow: `/dedupe` → `/cluster` → `/score` → `/route` → `/pack`; runbook JSON output.
- [ ] Discovery Worker posts Signal to Orchestrator (Tier-3 discovery:web).
- [ ] Connectors stubs: CPGRAMS / Swachhata / TN CM (enqueue + simulated success).
- [ ] SLA loop runs with reminder/deadline; emits escalation webhook if configured.
- [ ] Smoke tests: 1 Action, 1 Draft, 1 Reject; artifacts generated for Action.
- [ ] README updated for setup + local run.

## PR/QA Checklist
- [ ] Branch name matches convention (`feature/`, `fix/`, `chore/`).
- [ ] Commit messages are clear (imperative) and reference checklist item(s).
- [ ] Docs updated if behavior changes.
- [ ] No secrets committed.
- [ ] Test-suites-only validation succeeded (no full local environment run required).
