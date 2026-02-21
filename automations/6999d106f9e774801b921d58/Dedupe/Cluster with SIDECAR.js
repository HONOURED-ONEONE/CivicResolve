import requests
import json
from typing import Any, Dict

def dedupe_cluster_with_sidecar() -> None:
    """
    Calls the SIDECAR /dedupe endpoint with MEPP. Stores dedupe info in context (duplicate_of, similarity, distance_km).
    """
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    mepp = getContext('MEPP_JSON')
    if not SIDECAR_BASE_URL or not mepp:
        print("Missing SIDECAR_BASE_URL or MEPP; cannot dedupe.")
        setContext('DEDUPE_INFO', {})
        return
    dedupe_url = f"{SIDECAR_BASE_URL}/dedupe"
    try:
        resp = requests.post(dedupe_url, json={'mepp': mepp}, timeout=10)
        resp.raise_for_status()
        dedupe = resp.json()
        print(f"SIDECAR dedupe response: {dedupe}")
        setContext('DEDUPE_INFO', dedupe)
    except Exception as e:
        print(f"Error in dedupe cluster: {e}")
        setContext('DEDUPE_INFO', {})

dedupe_cluster_with_sidecar()