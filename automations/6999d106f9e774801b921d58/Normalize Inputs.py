from runtime import getContext, setContext
import logging
import os
import json
from datetime import datetime, UTC
from typing import Dict, Any

def build_normalized_mepp(data: Dict[str, Any]) -> Dict[str, Any]:
    # Normalize and strictly map to nested MEPP contract
    def extract(first, dct, typ=str, fallback=None):
        v = dct.get(first, fallback)
        return v if typ is None else (v if isinstance(v, typ) else fallback)

    # Only use input where present; do not forcibly lowercase names/addresses, only trim whitespace
    issue = {
        'summary': extract('summary', data, str, '').strip() if extract('summary', data, str, None) else '',
        'details': extract('details', data, str, '').strip() if extract('details', data, str, None) else '',
        'category': extract('category', data, str, '').strip() if extract('category', data, str, None) else '',
    }
    location = {
        'lat': float(data['lat']) if 'lat' in data and data['lat'] is not None else None,
        'lon': float(data['lon']) if 'lon' in data and data['lon'] is not None else None,
        'address_text': extract('address_text', data, str, '').strip() if extract('address_text', data, str, None) else '',
        'ward': extract('ward', data, str, '').strip() if extract('ward', data, str, None) else '',
    }
    contact_type = data.get('contact_type', '').strip() or 'none'
    contact_value = data.get('contact_value', '').strip() if data.get('contact_value') else ''
    reporter = {
        'contact': {'type': contact_type, 'value': contact_value},
        'anonymity_requested': bool(data.get('anonymity_requested', False)),
    }
    norm = {
        'MEPP': {
            'issue': issue,
            'location': location,
            'evidence': {},
            'provenance': {},
        },
        'reporter': reporter
    }
    return norm

if __name__ == "__main__":
    try:
        PREV_OUTPUT = os.environ.get('VALIDATED_INTAKE_JSON', '{}')
        validated_intake = json.loads(PREV_OUTPUT)
        normalized_inputs = build_normalized_mepp(validated_intake.get('validated_intake', validated_intake))
        timestamp = datetime.now(UTC).isoformat()
        setContext('NORMALIZED_INPUTS', {'normalized_inputs': normalized_inputs, 'normalized_at': timestamp})
        print(json.dumps({'normalized_inputs': normalized_inputs, 'normalized_at': timestamp}))
    except Exception as ex:
        logging.error(f'Normalization error: {ex}')
        fallback = {'normalized_inputs': {}, 'normalized_at': datetime.now(UTC).isoformat(), 'error': str(ex)}
        setContext('NORMALIZATION_ERROR', fallback)
        print(json.dumps(fallback))