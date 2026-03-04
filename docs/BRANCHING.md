# Branching Strategy & Workflow

This document outlines the standard Git branching workflow for MVP development.

## Branch Naming Conventions
- `feature/*`: New features, MVP modules, connectors.
- `fix/*`: Bug fixes and quick patches.
- `chore/*`: Configuration updates, documentation, dependency upgrades.
- `release/*`: Pre-deployment stabilization and RC branching.

## Main Working Branch
- **Base:** `main`
- **Current MVP Integration Branch:** `feature/mvp-2026-03`
  - All MVP sub-branches should merge into this branch.
  - Once the MVP checklist is complete, this branch will be merged into `main`.

## Sub-Branch Strategy (Parallel Work)
To enable parallel development, we use sub-branches checked out from the main working branch:
- `feature/sidecar-cluster-pack`: Sidecar `/cluster` and `/pack` endpoint implementation.
- `feature/orchestrator-signal-gate`: Orchestrator Signal Gate logic.
- `feature/connectors-stub`: Connector stubs (CPGRAMS / Swachhata / TN CM).
- `feature/ingest-matrix-worker`: Discovery Worker ingestion routing.

## PR Rules & Merge Order
1. **Commit Messages**: Use clear, imperative messages (e.g., `Add connector stubs for CPGRAMS`, `Fix /dedupe path normalization`). Reference checklist items if applicable.
2. **Review Rule**: Require at least 1 approval before merging into `feature/mvp-2026-03`.
3. **Merge Order**:
   - Establish base API schemas first (Sidecar / Orchestrator base models).
   - Implement standalone endpoints/workers.
   - Finally, merge integration code (e.g., Orchestrator calling Sidecar).
4. **Conflict Mitigation**: Frequently rebase sub-branches against `feature/mvp-2026-03` to stay up to date.

See `docs/MVP_CHECKLIST.md` for the Definition of Done.