import requests
import time
from typing import Dict, Any

def credibility_gate_via_sidecar() -> None:
    """
    POST MEPP to SIDECAR /score. If credibility < 0.65, nudge the reporter and set status = NEEDS_INFO. Passes score/hint/context to next step.
    """
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    mepp = getContext('MEPP_JSON')
    dedupe = getContext('DEDUPE_INFO')
    if not SIDECAR_BASE_URL or not mepp:
        print("SIDECAR_BASE_URL or MEPP missing; cannot score credibility.")
        setContext('CREDIBILITY_INFO', {})
        return
    score_url = f"{SIDECAR_BASE_URL}/score"
    try:
        resp = requests.post(score_url, json={'mepp': mepp}, timeout=10)
        resp.raise_for_status()
        info = resp.json()
        score = info.get('score', 0.0)
        hint = info.get('hint', '')
        print(f"SIDECAR credibility response: {info}")
        out = {'score': score, 'hint': hint, 'status': 'OK'}
        if score < 0.65:
            contact = mepp.get('reporter', {}).get('contact', None)
            if contact:
                # Placeholder: Integrate with real notification channel in downstream steps
                print(f"Nudge to {contact}: Please add a second photo or a nearby landmark. Hint: {hint}")
            out['status'] = 'NEEDS_INFO'
        setContext('CREDIBILITY_INFO', out)
    except Exception as e:
        print(f"Error in credibility scoring: {e}")
        setContext('CREDIBILITY_INFO', {'score': 0.0, 'hint': '', 'status': 'ERROR'})

credibility_gate_via_sidecar()