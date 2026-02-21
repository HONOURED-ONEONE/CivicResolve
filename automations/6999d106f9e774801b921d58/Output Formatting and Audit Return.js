import json
from typing import Dict, Any

def output_formatting_and_audit() -> None:
    """
    Collates contract-required output fields, logs audit, and returns final output for the workflow.
    """
    mepp = getContext('MEPP_JSON')
    dedupe = getContext('DEDUPE_INFO')
    credibility = getContext('CREDIBILITY_INFO')
    routing = getContext('ROUTING_INFO')
    filing = getContext('FILING_INFO')
    sla_info = getContext('SLA_INFO')
    signature = getContext('MEPP_SIGNATURE')
    case_id = mepp.get('case_id','') if mepp else ''
    output = {
        'case_id': case_id,
        'mepp_signature': signature,
        'duplicate_of': dedupe.get('duplicate_of','') if dedupe else '',
        'credibility_score': credibility.get('score',0.0) if credibility else 0.0,
        'routing.dest': routing.get('dest','') if routing else '',
        'routing.confidence': routing.get('confidence',0.0) if routing else 0.0,
        'ticket_id': sla_info.get('ticket_id','') if sla_info else '',
        'status': sla_info.get('status','') if sla_info else '',
        'artifact_url': sla_info.get('artifact_url','') if sla_info else ''
    }
    audit_line = f"[ONE-FLOW] {case_id} dest={output['routing.dest']} score={output['credibility_score']} ticket={output['ticket_id']} status={output['status']}"
    print(audit_line)
    print(json.dumps(output, indent=2))
    setContext('FINAL_OUTPUT', output)

output_formatting_and_audit()