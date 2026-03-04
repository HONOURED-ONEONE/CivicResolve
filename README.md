
## Development Workflow

We are currently working towards the MVP. Please review the following before contributing:
- **[Branching Strategy & Workflow](docs/BRANCHING.md)**: Guidelines for feature sub-branches and PR rules.
- **[MVP Acceptance Checklist](docs/MVP_CHECKLIST.md)**: The definitive task list for MVP completion.

**Quickstart (Branch Bootstrap):**
To safely create the standard MVP development branches locally, simply run:
```bash
./scripts/bootstrap-branches.sh
git checkout feature/mvp-2026-03
```

## Deployment

This project uses a `.python-version` file to pin the Python runtime to **3.12.8** for Railway/railpack/mise compatibility. This ensures deterministic builds and avoids compilation issues with `pydantic-core`.

## Quick Tests

The sidecar now supports path normalization (e.g., `//dedupe` -> `/dedupe`) and CORS preflight for `OPTIONS`.

1.  **Run Locally:**
    ```bash
    uvicorn sidecar.main:app --reload
    ```

2.  **Verify Path Normalization:**
    ```bash
    # Normal path
    curl -X POST "http://localhost:8000/dedupe" \
      -H "Content-Type: application/json" \
      -d '{"mepp": {"issue": {"summary": "test"}}}'

    # Double slash path (should work)
    curl -X POST "http://localhost:8000//dedupe" \
      -H "Content-Type: application/json" \
      -d '{"mepp": {"issue": {"summary": "test"}}}'
    ```

3.  **Verify CORS Preflight:**
    ```bash
    curl -X OPTIONS "http://localhost:8000/dedupe" -v
    ```

## Environment Variables
- `CLUSTER_DB`: Path to SQLite DB for clusters (default: `cluster.db`)
- `CLUSTER_JACCARD_MIN`: Minimum Jaccard similarity to cluster (default: `0.45`)
- `PACK_DIR`: Directory to store generated pack artifacts (default: `./packs`)
- `PACK_MAX_EVIDENCE`: Maximum number of photos included in the pack PDF (default: `5`)

## Smoke Tests

### Test 1: /cluster creates a new cluster
```bash
curl -s -X POST http://localhost:8000/cluster \
  -H "Content-Type: application/json" \
  -d '{
    "mepp":{
      "version":"1.0",
      "issue":{"summary":"Overflowing garbage near market","category":"sanitation/garbage","details":"2 days"},
      "location":{"lat":11.109,"lon":77.341,"address_text":"Ward 14 market","ward":"14"},
      "evidence":{"photos":["https://ex/p1.jpg","https://ex/p2.jpg"]},
      "provenance":{"channel":"matrix","raw_id":"RAW-001"}
    }
  }'
```

### Test 2: /cluster called again attaches to same cluster and increments members
(repeat the same curl and confirm `cluster_id` stable and `members` increased)

### Test 3: /pack generates JSON+PDF and returns file URLs + sha256
```bash
curl -s -X POST http://localhost:8000/pack \
  -H "Content-Type: application/json" \
  -d '{
    "mepp":{
      "version":"1.0",
      "issue":{"summary":"Overflowing garbage near market","category":"sanitation/garbage","details":"2 days"},
      "location":{"lat":11.109,"lon":77.341,"address_text":"Ward 14 market","ward":"14"},
      "evidence":{"photos":["https://ex/p1.jpg","https://ex/p2.jpg"]},
      "provenance":{"channel":"matrix","raw_id":"RAW-001"}
    },
    "gating":{"status":"action","tier":3,"source_confidence":0.55,"content_confidence":1.0,"final_confidence":0.55,"missing_fields":[]},
    "routing":{"dest":"ULB_TIRUPPUR_SANITATION","confidence":0.9,"basis":["rule: sanitation+ward14"]},
    "cluster":{"cluster_id":"CL-REPLACE","is_new":false,"members":2,"geo_cell":"33333:22222","text_similarity":0.62}
  }'
```
