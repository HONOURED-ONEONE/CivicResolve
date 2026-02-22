import json
from datetime import datetime, UTC
from runtime import getContext, setContext

def output_formatting_and_audit():
    mepp = getContext('MEPP_JSON') or {}
    dedupe = getContext('DEDUPE_INFO') or {}
    credibility = getContext('CREDIBILITY_INFO') or {}
    routing = getContext('ROUTING_INFO') or {}
    sla_info = getContext('SLA_INFO') or {}
    signature = getContext('MEPP_SIGNATURE')
    audit_log = getContext('AUDIT_LOG') or []
    # Build strictly nested output (no dotted keys)
    output = {
        "case_id": mepp.get("case_id", ""),
        "mepp_signature": signature,
        "duplicate_of": dedupe.get("duplicate_of", ""),
        "credibility": {
            "score": credibility.get("score", 0.0),
            "status": credibility.get("status", "")
        },
        "routing": {
            "dest": routing.get("dest", ""),
            "confidence": routing.get("confidence", 0.0),
            "basis": routing.get("basis", []) if isinstance(routing.get("basis", []), list) else ([str(routing.get("basis", []))] if routing.get("basis", []) else []),
            "moderation_flag": routing.get("moderation_flag", False)
        },
        "sla": {
            "ticket_id": sla_info.get("ticket_id", ""),
            "status": sla_info.get("status", ""),
            "artifact_url": sla_info.get("artifact_url", ""),
            "completed_at_utc": sla_info.get("completed_at_utc", ""),
            "expected_update_by": sla_info.get("expected_update_by", "")
        },
        "mepp": mepp,
        "timestamp": datetime.now(UTC).isoformat()
    }
    audit_masked = []
    pii_mask_fields = {"reporter", "contact", "email", "phone", "name", "address", "location"}
    for entry in audit_log:
        if isinstance(entry, dict):
            audit_masked.append({k: '[MASKED]' if isinstance(k, str) and k.lower() in pii_mask_fields else v for k, v in entry.items()})
        else:
            audit_masked.append(entry)
    output["audit"] = audit_masked
    setContext("FINAL_OUTPUT", output)
    print(json.dumps(output, indent=2))

output_formatting_and_audit()