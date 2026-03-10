# Local Development

## Prerequisites
- Node.js (18+)
- Python (3.12+)
- Docker and docker-compose

## Setup
1. Copy `.env.example` to `.env`
2. Run `npm install` in the root (which leverages NPM Workspaces to install all Node.js service dependencies).
3. Setup Python venv for the intelligence service:
   ```bash
   cd services/intelligence-service
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

## Test-Suites-Only Validation Policy
To validate basic functionality and verify migration completion, you do **not** need a full local environment. Our policy strictly dictates a **test-suites-only validation** approach. 

**Allowed validation commands are tests only:**
- Run Node service integration tests: `npm test`
- Run Persistence tests: `node tests/integration/persistence.test.js`
- Run Python intelligence service tests: `cd services/intelligence-service && python -m pytest`

*Note: No full local environment run is required. `docker-compose` is provided for deployment and development parity only. It is not required for migration validation.*

## Running Services via Docker (Optional)
```bash
docker-compose up --build
```

## Running Services Locally (NPM) (Optional)
```bash
npm run start:orchestrator
npm run start:connectors
npm run start:ai
npm run start:sla
npm run start:governance
npm run start:intelligence
```
