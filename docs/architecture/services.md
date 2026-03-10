# Services Boundary & Responsibilities

All services include a standard `/health` endpoint for monitoring and uptime checks.

## case-orchestrator-service (Node.js)
- Ownership: Primary orchestrator for the platform.
- Normalizes ingestion signals
- Computes deterministic gate (`action`, `needs_info`, `reject_low_signal`)
- Coordinates async API calls to other services
- Enforces strict contract validation on deterministic paths (failing on error) and fail-open semantics for AI advisory paths
- Pushes metrics and provenance

## intelligence-service (Python / FastAPI)
- Ownership: Deterministic core logic for data processing.
- Preserves the legacy deterministic logic.
- Endpoints: `/dedupe`, `/cluster`, `/score`, `/route`, `/pack`.

## ai-advisory-service (Node.js)
- Ownership: Optional AI enrichments (strictly advisory).
- Provides AI enrichments.
- Endpoints: `/vision_extract`, `/draft_assist`, `/search_citations`.
- Must return `derived=true` in payloads for any AI-generated data.

## connector-services (Node.js)
- Ownership: Integration with external civic systems.
- Handles adapter logic for downstream filing via a shared adapter framework.
- Supports canonical request and response normalization.
- Includes idempotency behavior (caches identical requests to prevent duplicate submissions) and transient retry/backoff policies.
- **Adapters**:
  - `CPGRAMS`: Simulated transport only (Sandbox Mode)
  - `SWACHHATA`: Simulated transport only (Sandbox Mode)
  - `TN_CM_HELPLINE`: Simulated transport only (Sandbox Mode)
  - `GENERIC`: Fallback stub behavior
- **Dependencies**: Requires `JSONStore` for durable receipt and idempotency persistence. Production environments will eventually require a true DB backend.
- Endpoint: `/file`, `/receipts/:ticket_id`.

## sla-status-service (Node.js)
- Ownership: Ticket lifecycle management.
- Initializes and advances ticket status (simulation or real).
- Endpoints: `/sla/init`, `/sla/:ticket_id`, `/status/simulate/:ticket_id`.

## governance-platform (Node.js)
- Ownership: Platform observability and auditing.
- Immutable logging of metrics and provenance.
- Endpoints: `/metrics`, `/provenance`, `/ai_log`.
