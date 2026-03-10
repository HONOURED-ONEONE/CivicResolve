# File-by-File Change Log

This document lists major migration moves and the current status of the decoupled architecture.

1. **`sidecar/` -> `services/intelligence-service/`**: Moved the core Python deterministic logic.
2. **`services/intelligence-service/main.py`**: Refactored `simulate_ulb_status` to be a deprecated wrapper calling the new Node SLA service.
3. **`services/intelligence-service/services.py`**: Removed `simulate_status` logic.
4. **`orchestrate.json` -> `docs/migration/orchestrate.legacy.json`**: Moved to legacy documentation.
5. **`package.json`**: Initialized root workspace.
6. **`packages/contracts/`**: Created JSON schemas for canonical objects.
7. **`packages/shared-config/`**: Created common env-based config for Node services.
8. **`packages/shared-utils/`**: Created trace ID and fail-open helpers.
9. **`services/case-orchestrator-service/`**: Implemented logic originally found in `orchestrate.json` into a stable Express app. Hardened to handle downstream failures (fail-open for AI, fail-closed for deterministic downstream contracts).
10. **`services/ai-advisory-service/`**: Implemented stubs for AI enrichment (vision, draft, citations).
11. **`services/connector-services/`**: Upgraded to a production-capable multi-adapter framework with `app.js` and `index.js` split. Added `adapters/` for specific civic subsystems (`cpgrams.js`, `swachhata.js`, `tncm.js`, `generic.js`) and `lib/` for canonical processing (`request-normalizer.js`, `response-normalizer.js`, `idempotency.js`, `retry-policy.js`, `receipt-store.js`, `adapter-registry.js`).
12. **`services/sla-status-service/`**: Adapted ticket status and SLA logic. Modified to use `JSONStore` to persist ticket state instead of an in-memory Map.
13. **`services/governance-platform/`**: Implemented metric and provenance endpoints. Modified to use `JSONStore` instead of an in-memory array.
14. **`docker-compose.yml`**: Added to manage all local services.
15. **`docs/`**: Created structural, migration, and operational markdown files to reflect the final service architecture and test-suites-only validation policy.
16. **`packages/shared-utils/persistence.js`**: Created `JSONStore`, a generic repository abstraction for pragmatic persistence in file or DB modes.
17. **`tests/integration/persistence.test.js`**: Added persistence validation tests using Node native runner.
18. **`Procfile`**: Deprecated, as we use `docker-compose` or discrete service invocations now.
