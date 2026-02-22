
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
