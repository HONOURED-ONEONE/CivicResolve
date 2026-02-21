import requests
import os
import json
from typing import Dict, Any

def department_routing_and_ml() -> None:
    """
    Applies routing rules; if no high-confidence match, POST MEPP to SIDECAR /route for ML fallback.
    Updates MEPP.routing in context.
    """
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    mepp = getContext('MEPP_JSON')
    credibility = getContext('CREDIBILITY_INFO')
    routing = {}
    basis = ""
    conf = 0.0
    dest = None
    if not mepp:
        print("MEPP not present; cannot route.")
        setContext('ROUTING_INFO', {})
        return
    ward = mepp.get('location', {}).get('ward', None)
    category = mepp.get('issue', {}).get('category', None)
    issue_text = str(mepp.get('issue', {}).get('description', '')).lower()
    if category in ["sanitation/garbage","sanitation/drainage"] and ward == "14":
        dest = "ULB_TIRUPPUR_SANITATION"
        conf = 0.90
        basis += "rule: sanitation+ward14"
    elif any(keyword in issue_text for keyword in ["streetlight","lamp","bulb"]):
        dest = "ULB_ELECTRICAL"
        conf = 0.75
        basis += "rule: streetlight keywords"
    else:
        if SIDECAR_BASE_URL:
            route_url = f"{SIDECAR_BASE_URL}/route"
            try:
                resp = requests.post(route_url, json={'mepp': mepp}, timeout=10)
                resp.raise_for_status()
                result = resp.json()
                dest = result.get('dest', None)
                conf = result.get('confidence', 0.0)
                basis += result.get('basis', '')
                print(f"SIDECAR routing response: {result}")
            except Exception as e:
                print(f"Error in ML routing: {e}")
    routing = {
        'dest': dest,
        'confidence': conf,
        'basis': basis
    }
    setContext('ROUTING_INFO', routing)
    # Update MEPP in context
    mepp['routing'] = routing
    setContext('MEPP_JSON', mepp)

department_routing_and_ml()