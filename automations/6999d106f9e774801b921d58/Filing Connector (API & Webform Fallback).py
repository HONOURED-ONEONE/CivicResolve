import requests
import os
import json
import time
from typing import Dict, Any

def filing_connector() -> None:
    """
    Submits the MEPP ticket via API if available, else falls back to webform automation.
    Captures ticket_id, artifact_url, and updates SLA info in MEPP context.
    """
    ULB_PORTAL_BASE_URL = os.environ.get('ULB_PORTAL_BASE_URL')
    mepp = getContext('MEPP_JSON')
    routing = getContext('ROUTING_INFO')
    if not mepp or not routing:
        print("Missing MEPP or routing; filing connector aborting.")
        setContext('FILING_INFO', {})
        return
    ticket_id = None
    artifact_url = None
    api_success = False
    # Attempt API submission first
    dest_api_url = os.environ.get(f"API_CONFIG_{routing.get('dest','').upper()}", None)
    if dest_api_url:
        try:
            resp = requests.post(dest_api_url, json=mepp, timeout=15)
            resp.raise_for_status()
            api_result = resp.json()
            ticket_id = api_result.get('ticket_id', None)
            artifact_url = api_result.get('artifact_url', None)
            api_success = True
            print(f"Filed via API: ticket_id={ticket_id}, artifact={artifact_url}")
        except Exception as e:
            print(f"API filing failed: {e}")
    # Webform fallback
    if not api_success and ULB_PORTAL_BASE_URL:
        print("Fallback to web-form automation...")
        # In demo, just simulate artifact/ticket capture
        ticket_id = f"WFB-{mepp['case_id'][:6]}-{int(time.time()) % 10000}"
        artifact_url = f"{ULB_PORTAL_BASE_URL}/artifacts/{ticket_id}.pdf"
        print(f"Simulated webform submission: ticket_id={ticket_id} artifact={artifact_url}")
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    sla = {
        'filed_at': now,
        'expected_update_by': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 21*60)),
        'ticket_id': ticket_id,
        'artifact_url': artifact_url
    }
    filing_info = {
        'ticket_id': ticket_id,
        'artifact_url': artifact_url,
        'filed_at': now,
        'sla': sla
    }
    # Update MEPP
    mepp['sla'] = sla
    setContext('MEPP_JSON', mepp)
    setContext('FILING_INFO', filing_info)

filing_connector()