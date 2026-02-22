from runtime import getContext, setContext
import requests
import json
import os
import time
from typing import Any, Dict

def dedupe_cluster_with_sidecar() -> None:
    """
    Calls SIDECAR /dedupe with MEPP. Manages idempotency; short-circuits duplicate runs.
    Stores dedupe info in context (duplicate_of, similarity, distance_km, idempotency_key).
    """
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    mepp = getContext('MEPP_JSON')
    if not SIDECAR_BASE_URL or not mepp:
        print("Missing SIDECAR_BASE_URL or MEPP; cannot dedupe.")
        setContext('DEDUPE_INFO', {})
        return
    # Deterministic idempotency key
    source = mepp.get('provenance', {})
    raw_id = source.get('raw_id', '')
    channel = source.get('channel', '')
    idempotency_key = f"{raw_id}:{channel}"
    setContext('IDEMPOTENCY_KEY', idempotency_key)
    # If previous dedupe/cluster run exists, short-circuit
    existing = getContext('IDEMPOTENT_RUNS') or set()
    if isinstance(existing, list):
        existing = set(existing)
    if idempotency_key in existing:
        print(f"Duplicate run detected for idempotency_key {idempotency_key}; short-circuiting.")
        setContext('DEDUPE_INFO', {'skipped': True, 'idempotency_key': idempotency_key})
        return
    # Track key in run log
    existing.add(idempotency_key)
    setContext('IDEMPOTENT_RUNS', list(existing))
    dedupe_url = f"{SIDECAR_BASE_URL}/dedupe"
    try:
        resp = requests.post(dedupe_url, json={'mepp': mepp}, timeout=10)
        resp.raise_for_status()
        dedupe = resp.json()
        dedupe['idempotency_key'] = idempotency_key
        print(f"SIDECAR dedupe response: {dedupe}")
        setContext('DEDUPE_INFO', dedupe)
    except Exception as e:
        print(f"Error in dedupe cluster: {e}")
        setContext('DEDUPE_INFO', {'idempotency_key': idempotency_key, 'error': str(e)})

dedupe_cluster_with_sidecar()