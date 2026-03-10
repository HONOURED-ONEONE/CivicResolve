# CivicResolve Architecture Overview

CivicResolve has been refactored into a decoupled, final service architecture.

## Principles
1. **Deterministic Core:** Routing and Gate logic remains rule-based and auditable. The deterministic core remains strictly authoritative over all case decisions.
2. **AI as Advisory:** AI provides OCR, enrichment hints, draft assistance, and citations but never mutates final gating or routing outcomes directly. The boundary between the deterministic core and advisory AI is absolute.
3. **Fail-Open:** If an AI service fails, the platform continues without AI enrichment.

## High-Level Topology
1. **Case Orchestrator Service:** Entrypoint for signals. Normalizes data, computes deterministic gate, orchestrates calls to intelligence and AI services, and coordinates filing.
2. **Intelligence Service:** Deterministic Python service for deduplication, clustering, scoring, routing, and pack generation.
3. **Connector Services:** Modular adapters for CPGRAMS, Swachhata, TN CM Helpline.
4. **AI Advisory Service:** Optional AI enrichments like Vision Extract and Draft Assist.
5. **SLA / Status Service:** Manages ticket state, reminders, and escalations.
6. **Governance / Audit Platform:** Collects metrics, provenance, and logs AI invocations for auditability.
