from runtime import getContext, setContext
import requests
import os
import json
from typing import Dict, Any

def department_routing_and_ml() -> None:
    """
    Applies routing rules; if no high-confidence match, POST MEPP to SIDECAR /route for ML fallback.
    Updates MEPP.routing in context; outputs fully nested and type-compliant routing dicts.
    """
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    mepp = getContext('MEPP_JSON')
    credibility = getContext('CREDIBILITY_INFO')
    routing = {}
    basis = []  # Always a list of explanations
    conf = 0.0
    dest = None
    if not mepp:
        print("MEPP not present; cannot route.")
        setContext('ROUTING_INFO', {})
        return
    ward = mepp.get('location', {}).get('ward', None)
    category = mepp.get('issue', {}).get('category', None)
    issue_text = str(mepp.get('issue', {}).get('summary', '')).lower()  # STRICT: use summary, not description
    if category in ["sanitation/garbage","sanitation/drainage"] and ward == "14":
        dest = "ULB_TIRUPPUR_SANITATION"
        conf = 0.90
        basis.append("rule: sanitation+ward14")
    elif any(kw in issue_text for kw in ["streetlight","lamp","bulb"]):
        dest = "ULB_ELECTRICAL"
        conf = 0.75
        basis.append("rule: streetlight keywords")
    else:
        # ML Fallback via SIDECAR
        if SIDECAR_BASE_URL:
            route_url = f"{SIDECAR_BASE_URL}/route"
            try:
                resp = requests.post(route_url, json={'mepp': mepp}, timeout=10)
                resp.raise_for_status()
                result = resp.json()
                dest = result.get('dest', None)
                conf = result.get('confidence', 0.0)
                basis_val = result.get('basis')
                if isinstance(basis_val, list):
                    basis.extend(str(x) for x in basis_val)
                elif isinstance(basis_val, str) and basis_val:
                    basis.append(basis_val)
                if not dest:
                    dest = "ULB_GENERIC"
                    conf = 0.10
                    basis.append("fallback: no confident routing from ML");
            except Exception as e:
                dest = "ULB_GENERIC"
                conf = 0.10
                basis.append(f"fallback: ML error: {e}")
        else:
            dest = "ULB_GENERIC"
            conf = 0.10
            basis.append("fallback: no rules or ML available")
    if not basis:
        basis.append("fallback: no basis generated")
    # Always moderate if fallback
    moderation = False
    if dest == "ULB_GENERIC" or conf < 0.30:
        moderation = True
        basis.append("moderation required: fallback or low confidence")
    routing = {
        'dest': dest,
        'confidence': conf,
        'basis': basis,
        'moderation_flag': moderation
    }
    setContext('ROUTING_INFO', routing)
    # Update MEPP in context
    mepp['routing'] = routing
    setContext('MEPP_JSON', mepp)

department_routing_and_ml()