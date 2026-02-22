# CivicResolve Sidecar API

A lightweight helper service for the CivicResolve orchestration platform, providing deduplication, credibility scoring, routing, and status simulation.

## Features

- **Deduplication**: Identifies potential duplicate reports against a canonical incident list.
- **Credibility Scoring**: Evaluates report quality based on evidence, location, and user history.
- **Routing**: Routes reports to the appropriate Urban Local Body (ULB) department.
- **Status Simulation**: Simulates the lifecycle of a ticket for demonstration purposes.

## Requirements

- Python 3.8+
- pip

## Setup & Run

1.  **Create a virtual environment:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the service:**
    ```bash
    # Default (Port 8000)
    uvicorn sidecar.main:app --reload

    # With Environment Variables
    export API_KEY="secret-key"
    export DEDUPE_THRESHOLD=0.7
    uvicorn sidecar.main:app --reload --port 8000
    ```

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8000` | Port to listen on. |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR). |
| `API_KEY` | `None` | If set, requires `X-API-Key` header on requests. |
| `DEDUPE_THRESHOLD` | `0.65` | Similarity threshold for deduplication (0.0 - 1.0). |
| `SIM_PROGRESS_MINUTES` | `5` | Minutes to advance ticket status in simulation. |
| `MAX_TICKETS_IN_MEMORY` | `500` | Maximum number of tickets to track in simulation. |
| `CORS_ALLOW_ORIGINS` | `*` | Comma-separated list of allowed origins. |

## Quick Tests (cURL)

Ensure the service is running at `http://localhost:8000`. If `API_KEY` is set, add `-H "X-API-Key: <your-key>"` to requests.

### 1. Dedupe (Sanitation Example)

Expected: Low similarity (unless matching canonical "overflowing garbage bin").

```bash
curl -X POST http://localhost:8000/dedupe \
  -H "Content-Type: application/json" \
  -d '{
    "mepp": {
      "issue": { "summary": "overflowing garbage bin at main street market" },
      "location": { "lat": 11.1085, "lon": 77.3411 }
    }
  }'
```

### 2. Score Credibility

**Case A: 1 Photo, Good Location**
Expected: Moderate score (~0.6-0.8), Hint: "Add a second photo..."

```bash
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{
    "mepp": {
      "evidence": { "photos": [{"url": "http://img.com/1"}] },
      "location": { "lat": 11.1, "lon": 77.3, "address_text": "123 Main St" }
    }
  }'
```

**Case B: 2 Photos, Good Location**
Expected: High score (~0.8+), Hint: "Looks good."

```bash
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{
    "mepp": {
      "evidence": { "photos": [{"url": "http://img.com/1"}, {"url": "http://img.com/2"}] },
      "location": { "lat": 11.1, "lon": 77.3, "address_text": "123 Main St" }
    }
  }'
```

### 3. Route (Streetlight)

Expected: `dest="ULB_ELECTRICAL"`, `confidence=0.75`

```bash
curl -X POST http://localhost:8000/route \
  -H "Content-Type: application/json" \
  -d '{
    "mepp": {
      "issue": { "summary": "broken streetlight near park", "category": "electrical" },
      "location": { "ward": "10" }
    }
  }'
```

### 4. Simulate Status

Call multiple times. Status advances every `SIM_PROGRESS_MINUTES`.
To test quickly, set `SIM_PROGRESS_MINUTES=0.1` (6 seconds).

```bash
curl "http://localhost:8000/simulate_ulb_status?ticket_id=TICKET-123"
```

## Postman Collection (Basic)

Import this JSON as a raw collection:

```json
{
	"info": {
		"name": "Sidecar API",
		"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
	},
	"item": [
		{
			"name": "Health Check",
			"request": {
				"method": "GET",
				"header": [],
				"url": {
					"raw": "http://localhost:8000/healthz",
					"protocol": "http",
					"host": ["localhost"],
					"port": "8000",
					"path": ["healthz"]
				}
			}
		},
		{
			"name": "Dedupe",
			"request": {
				"method": "POST",
				"header": [{"key": "Content-Type", "value": "application/json"}],
				"body": {
					"mode": "raw",
					"raw": "{\"mepp\":{\"issue\":{\"summary\":\"overflowing garbage\"},\"location\":{\"lat\":11.1085,\"lon\":77.3411}}}"
				},
				"url": "http://localhost:8000/dedupe"
			}
		},
		{
			"name": "Score",
			"request": {
				"method": "POST",
				"header": [{"key": "Content-Type", "value": "application/json"}],
				"body": {
					"mode": "raw",
					"raw": "{\"mepp\":{\"evidence\":{\"photos\":[{\"url\":\"...\"}]},\"location\":{\"lat\":11.1,\"lon\":77.3,\"address_text\":\"Main St\"}}}"
				},
				"url": "http://localhost:8000/score"
			}
		},
		{
			"name": "Route",
			"request": {
				"method": "POST",
				"header": [{"key": "Content-Type", "value": "application/json"}],
				"body": {
					"mode": "raw",
					"raw": "{\"mepp\":{\"issue\":{\"summary\":\"streetlight broken\"},\"location\":{\"ward\":\"12\"}}}"
				},
				"url": "http://localhost:8000/route"
			}
		},
		{
			"name": "Status Simulation",
			"request": {
				"method": "GET",
				"header": [],
				"url": "http://localhost:8000/simulate_ulb_status?ticket_id=TICKET-123"
			}
		}
	]
}
```
