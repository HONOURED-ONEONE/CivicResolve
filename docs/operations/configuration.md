# Configuration

All services share configuration via `.env` and the `@civicresolve/shared-config` package.

## Environment Variables by Service

### case-orchestrator-service
- `PORT`: Service port (default: 3000)
- `INTELLIGENCE_SERVICE_URL`: URL to the intelligence service
- `AI_ADVISORY_SERVICE_URL`: URL to the AI advisory service
- `CONNECTOR_SERVICES_URL`: URL to the connector services
- `SLA_STATUS_SERVICE_URL`: URL to the SLA status service

### intelligence-service
- `PORT`: Service port (default: 8000)
- `API_KEY`: Authentication key for the intelligence API
- `LOG_LEVEL`: Logging verbosity (default: INFO)
- `DEDUPE_THRESHOLD`: Threshold for duplicate detection
- `CLUSTER_DB`: SQLite database file path
- `CLUSTER_JACCARD_MIN`: Minimum Jaccard similarity for clustering
- `PACK_DIR`: Directory to store generated packs
- `SLA_STATUS_SERVICE_URL`: URL for the deprecated ULB status simulation wrapper

### ai-advisory-service
- `PORT`: Service port (default: 3001)

### connector-services
- `PORT`: Service port (default: 3002)

### sla-status-service
- `PORT`: Service port (default: 3003)

### governance-platform
- `PORT`: Service port (default: 3004)

## Feature Flags
- `ENABLE_AI_ADVISORY` (boolean): Master switch for AI calls in orchestrator.
- `ENABLE_DRAFT_ASSIST` (boolean): Toggles draft generation on `needs_info` gate.

## Persistence
By default, the persistence layer utilizes a `JSONStore` fallback storing data to `.data/` locally or `STORAGE_DIR` if specified in the environment (or memory if running tests). It can be configured for Postgres via the `DATABASE_URL` variable.
- `DATABASE_URL` (string): Postgres connection URL (e.g. `postgres://user:pass@localhost:5432/civic`). Used by `JSONStore` as a signal to use Postgres (to be implemented via `pg` driver if active).
- `STORAGE_DIR` (string): Absolute path to save `.json` database files if `DATABASE_URL` is omitted. Defaults to `.data` in the current working directory.

## Providers
By default, the system runs with `stub` providers. You can specify `openai` or `anthropic` and provide keys.
