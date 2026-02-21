import requests
import os
import json
import time
from typing import Dict, Any

def status_polling_and_sla() -> None:
    """
    Polls status via API/simulated endpoint. If deadlines missed, sends reminders or escalates. Ends on RESOLVED/CLOSED.
    """
    SIDECAR_BASE_URL = os.environ.get('SIDECAR_BASE_URL')
    NOTIFY_WEBHOOK = os.environ.get('NOTIFY_WEBHOOK')
    mepp = getContext('MEPP_JSON')
    filing = getContext('FILING_INFO')
    status = 'SUBMITTED'
    ticket_id = filing.get('ticket_id') if filing else None
    artifact_url = filing.get('artifact_url') if filing else None
    update_deadline = None
    if not ticket_id or not SIDECAR_BASE_URL:
        print("Missing ticket_id or SIDECAR_BASE_URL; cannot poll status/SLA.")
        setContext('SLA_INFO', {})
        return
    sla = mepp.get('sla', {}) if mepp else {}
    update_by = sla.get('expected_update_by', None)
    poll_url = f"{SIDECAR_BASE_URL}/simulate_ulb_status?ticket_id={ticket_id}"
    started = time.time()
    reminded = False
    escalated = False
    # Compress demo intervals (21m=1260s, 7m=420s)
    deadline = started + 21*60
    reminder_time = started + 7*60
    while True:
        try:
            res = requests.get(poll_url, timeout=8)
            res.raise_for_status()
            resp = res.json()
            cur_status = resp.get('status', '')
            print(f"Status poll: {cur_status}")
            if cur_status in ['RESOLVED','CLOSED']:
                status = cur_status
                break
            now = time.time()
            if now > reminder_time and not reminded:
                # Reminder logic
                # Placeholder: integrate outbound contact (email/SMS/WhatsApp)
                print(f"Reminder: No update for {ticket_id}, notifying contacts now.")
                reminded = True
            if now > deadline and not escalated:
                # Escalate
                summary = {
                    'case_id': mepp['case_id'],
                    'ticket_id': ticket_id,
                    'artifact_url': artifact_url,
                    'basis': mepp.get('routing', {}).get('basis','')
                }
                try:
                    resp2 = requests.post(NOTIFY_WEBHOOK, json=summary, timeout=8)
                    print(f"Escalation notice sent: {summary}")
                except Exception as e:
                    print(f"Failed to escalate: {e}")
                escalated = True
            time.sleep(30)  # Poll interval compress for demo
        except Exception as e:
            print(f"Status polling error: {e}")
            break
    # Output
    setContext('SLA_INFO', {
        'ticket_id': ticket_id,
        'status': status,
        'artifact_url': artifact_url
    })

status_polling_and_sla()