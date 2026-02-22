import requests
import os
import json
from datetime import datetime, UTC, timedelta
from runtime import getContext, setContext

def status_polling_and_sla():
    # Environment parameters for SLA & polling (always from env with defaults)
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    NOTIFY_WEBHOOK = os.environ.get('NOTIFY_WEBHOOK')
    SLA_REMINDER_SECONDS = int(os.environ.get('SLA_REMINDER_SECONDS', '420'))
    SLA_DEADLINE_SECONDS = int(os.environ.get('SLA_DEADLINE_SECONDS', '1260'))
    POLL_INTERVAL_SECONDS = int(os.environ.get('POLL_INTERVAL_SECONDS', '30'))
    MAX_POLLS = int(os.environ.get('SLA_MAX_POLL_ITERS', '40'))
    mepp = getContext('MEPP_JSON') or {}
    filing = getContext('FILING_INFO') or {}
    status = 'SUBMITTED'
    ticket_id = filing.get('ticket_id') if filing else None
    artifact_url = filing.get('artifact_url') if filing else None
    if not ticket_id or not SIDECAR_BASE_URL:
        print("Missing ticket_id or SIDECAR_BASE_URL; cannot poll status/SLA.")
        setContext('SLA_INFO', {})
        return
    poll_url = f"{SIDECAR_BASE_URL}/simulate_ulb_status?ticket_id={ticket_id}"
    started = datetime.now(UTC)
    start_epoch = started.timestamp()
    reminder_time = start_epoch + SLA_REMINDER_SECONDS
    deadline = start_epoch + SLA_DEADLINE_SECONDS
    reminded = False
    escalated = False
    poll_count = 0
    credibility = getContext('CREDIBILITY_INFO') or {}
    expected_update_by = (started + timedelta(seconds=SLA_DEADLINE_SECONDS)).isoformat()
    while poll_count < MAX_POLLS:
        try:
            res = requests.get(poll_url, timeout=8)
            res.raise_for_status()
            resp = res.json()
            cur_status = resp.get('status', '')
            print(f"Status poll: {cur_status}")
            if cur_status in ['RESOLVED','CLOSED']:
                status = cur_status
                break
            now = datetime.now(UTC)
            now_epoch = now.timestamp()
            if now_epoch > reminder_time and not reminded:
                print(f"Reminder: No update for {ticket_id}, notifying contacts now (SLA_REMINDER_SECONDS elapsed).")
                reminded = True
            if now_epoch > deadline and not escalated:
                # Prepare the escalation payload
                routing = (mepp or {}).get('routing', {})
                basis = routing.get('basis', [])
                if not isinstance(basis, list):
                    basis = [str(basis)] if basis else ['(fallback basis)']
                payload = {
                    'case_id': mepp.get('case_id'),
                    'ticket_id': ticket_id,
                    'artifact_url': artifact_url,
                    'routing': { 'basis': basis },
                    'expected_update_by': expected_update_by,
                    'credibility_score': credibility.get('score'),
                    'timestamp': datetime.now(UTC).isoformat()
                }
                if NOTIFY_WEBHOOK:
                    try:
                        resp2 = requests.post(NOTIFY_WEBHOOK, json=payload, timeout=8)
                        print(f"Escalation notice sent: {json.dumps(payload)}")
                    except Exception as e:
                        print(f"Failed to escalate: {e}")
                else:
                    print("NOTIFY_WEBHOOK is not set; skipping notification.")
                escalated = True
            poll_count += 1
            import time as _t; _t.sleep(POLL_INTERVAL_SECONDS)
        except Exception as e:
            print(f"Status polling error: {e}")
            break
    setContext('SLA_INFO', {
        'ticket_id': ticket_id,
        'status': status,
        'artifact_url': artifact_url,
        'expected_update_by': expected_update_by,
        'completed_at_utc': datetime.now(UTC).isoformat()
    })

status_polling_and_sla()