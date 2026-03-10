
## Development Workflow
# CivicResolve

CivicResolve is a decentralized, AI-assisted platform for orchestrating, analyzing, and routing civic incident reports.

## Architecture
CivicResolve has been refactored from a monolithic orchestration script and Python sidecar into a robust, decoupled microservices architecture:
- **Case Orchestrator Service**: Node.js/Express based deterministic workflow manager.
- **Intelligence Service**: Python/FastAPI core for deterministic deduplication, clustering, and routing.
- **AI Advisory Service**: Provides optional, fail-open AI enrichments (vision, draft assist, search).
- **Connector Services**: Modular adapters for downstream civic platforms (CPGRAMS, Swachhata, etc).
- **SLA Status Service**: Manages ticket lifecycle and escalations.
- **Governance Platform**: Centralized audit, metrics, and AI logging.

For more details, see:
- **[Architecture Overview](docs/architecture/overview.md)**
- **[Service Boundaries](docs/architecture/services.md)**
- **[File-by-File Change Log](docs/architecture/file-by-file-change-log.md)**
- **[Local Development](docs/operations/local-development.md)**
- **[Configuration](docs/operations/configuration.md)**
- **[Migration Notes](docs/migration/monolith-to-decoupled.md)**

## MVP Checklist
- **[Branching Strategy & Workflow](docs/BRANCHING.md)**: Guidelines for feature sub-branches and PR rules.
- **[MVP Acceptance Checklist](docs/MVP_CHECKLIST.md)**: The definitive task list for MVP completion.

## Validation Policy
**Test-Suites-Only Validation Policy**:
To validate the migration or changes, **no full local environment is required**. Basic validation is performed entirely via test suites in a test-only execution mode. 
**Do not run `docker-compose up` or long-lived service processes** to validate basic migration completeness.

- **Node Services Integration Tests**: `npm test`
- **Intelligence Service Tests**: `cd services/intelligence-service && python -m pytest`

*Note*: `docker-compose` is provided for deployment/dev parity only and is not required for migration validation. Deterministic gate and routing logic remain the source of truth, while AI remains advisory only.

## Deployment

This project uses a `.python-version` file to pin the Python runtime to **3.12.8** for Railway/railpack/mise compatibility.

## Environment Variables
- `CLUSTER_DB`: Path to SQLite DB for clusters (default: `cluster.db`)
- `CLUSTER_JACCARD_MIN`: Minimum Jaccard similarity to cluster (default: `0.45`)
- `PACK_DIR`: Directory to store generated pack artifacts (default: `./packs`)
- `PACK_MAX_EVIDENCE`: Maximum number of photos included in the pack PDF (default: `5`)

