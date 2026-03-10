# Monolith to Decoupled Migration

This document outlines the migration from the legacy monolith/sidecar architecture to our decoupled services architecture.

## Old Path -> New Path Mapping
- `sidecar/` -> `services/intelligence-service/`
- `sidecar/main.py` -> `services/intelligence-service/main.py` (and related files)
- `orchestrate.json` -> `docs/migration/orchestrate.legacy.json`
- `Procfile` -> **Deprecated** (We now use docker-compose for dev parity and direct service invocations)
- `sidecar/services.py` SLA logic -> `services/sla-status-service/`

## What Changed
- The single Python `sidecar` app and the massive JSON orchestrator file have been split into discrete microservices.
- The Python codebase was reduced strictly to intelligence and cluster/pack generation (`intelligence-service`).
- The Make/JSON orchestrator logic has been replaced by the `case-orchestrator-service` to allow for better unit testing and version control.
- `simulate_ulb_status` was moved out of Python into `sla-status-service`. A deprecated wrapper remains in `intelligence-service` for compatibility.
- `connector-services` has been upgraded from a simple mock endpoint to a multi-adapter framework supporting idempotency, retries, standardized contracts, and durable receipts.

## Deprecations
- Sidecar is now renamed to `intelligence-service`.
- The `sidecar/services.py` logic around SLA was removed.
- `Procfile` is deprecated and no longer used for running the application. It will be removed in a future cleanup.
