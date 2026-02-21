import hashlib
import json
import time
from typing import Any, Dict

def build_mepp_json() -> None:
    """
    Assemble the MEPP JSON from all upstream context results.
    Adds version, case_id, timestamp, reporter, issue, evidence, location, credibility, routing, sla, provenance.
    Result is set to context key 'MEPP_JSON'.
    """
    # Retrieve prior context
    normalized_inputs = getContext('NORMALIZED_INPUTS_JSON')
    photo_paths = getContext('PHOTO_PATHS')
    case_id = getContext('CASE_ID')
    intake_data = getContext('VALIDATED_INTAKE_JSON')

    # Compose evidence structure
    evidence = {
        "photos": photo_paths,
        "warning": normalized_inputs.get("evidence_warning", "")
    }
    # Compose MEPP
    mepp = {
        "version": "1.0",
        "case_id": case_id,
        "created_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "reporter": intake_data.get("reporter", {}),
        "issue": normalized_inputs.get("issue", {}),
        "evidence": evidence,
        "location": normalized_inputs.get("location", {}),
        "credibility": {},
        "routing": {},
        "sla": {},
        "provenance": intake_data.get("provenance", {})
    }
    setContext('MEPP_JSON', mepp)
    print(f"MEPP JSON assembled for case {case_id}:", json.dumps(mepp, indent=2))

build_mepp_json()