from runtime import getContext, setContext
import json
from datetime import datetime, UTC
from typing import Any, Dict

def mask_reporter(report):
    if not isinstance(report, dict): return None
    redacted = {k: ("***" if k in ["name","contact","email","phone"] else v) for k,v in report.items()}
    return redacted

def audit_logging() -> None:
    """
    Appends a structured audit event to AUDIT_LOG (append-only, UTC, PII-masked).
    Robust to errors/defaults. Logs 'MEPP_ASSEMBLED' event for contract trace.
    """
    try:
        mepp = getContext('MEPP_JSON')
        case_id = mepp.get('case_id', None) if mepp else 'N/A'
        # Gather and mask audit fields
        reporter = mask_reporter(mepp.get('reporter', {})) if mepp else None
        audit = {
            'logged_at': datetime.now(UTC).isoformat(),
            'case_id': case_id,
            'event': 'MEPP_ASSEMBLED',
            'details': {
                'reporter': reporter,
                'location': mepp.get('location') if mepp else None,
                'issue': mepp.get('issue') if mepp else None
            }
        }
        audit_log = getContext('AUDIT_LOG') or []
        if not isinstance(audit_log, list):
            audit_log = []
        audit_log.append(audit)
        setContext('AUDIT_LOG', audit_log)
        print(f"[AUDIT] {json.dumps(audit)}")
    except Exception as ex:
        fallback = {
            'logged_at': datetime.now(UTC).isoformat(),
            'case_id': 'N/A',
            'event': 'AUDIT_ERROR',
            'details': {'error': str(ex)}
        }
        setContext('AUDIT_LOG', [fallback])
        print(f"[AUDIT-ERROR] {json.dumps(fallback)}")

audit_logging()