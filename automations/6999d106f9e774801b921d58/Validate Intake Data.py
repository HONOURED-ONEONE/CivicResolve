from runtime import getContext, setContext
import logging
import os
import json
from datetime import datetime, UTC
from typing import Dict, Any

def _validate_mepp_schema(obj: dict, path: str = 'MEPP'):
    # Strict recursive validation for MEPP (expand as needed per spec)
    required_paths = [
        ('issue', dict),
        ('issue.summary', str),
        ('issue.details', str),
        ('issue.category', str),
        ('location', dict),
        ('location.lat', float),
        ('location.lon', float),
        ('location.address_text', str),
        ('location.ward', str),
        ('evidence', dict),
        ('provenance', dict)
    ]
    root = obj.get('MEPP', obj) if 'MEPP' in obj else obj
    for keys_str, typ in required_paths:
        keys = keys_str.split('.')
        node = root
        for key in keys:
            if key not in node:
                raise ValueError(f"Missing MEPP schema field: {'.'.join(keys)}")
            node = node[key]
        # final check
        if not isinstance(node, typ):
            # allow float/int conversion for lat/lon
            if typ == float and isinstance(node, int):
                continue
            raise ValueError(f"Field {'.'.join(keys)} must be type {typ.__name__}, got {type(node).__name__}")

if __name__ == "__main__":
    try:
        INTAKE_JSON = os.environ.get('INTAKE_DATA_JSON', '{}')
        parsed = json.loads(INTAKE_JSON)
        _validate_mepp_schema(parsed)
        timestamp = datetime.now(UTC).isoformat()
        setContext('VALIDATED_INTAKE', {'validated_intake': parsed, 'validated_at': timestamp})
        print(json.dumps({'validated_intake': parsed, 'validated_at': timestamp}))
    except Exception as ex:
        # Fallback: always log and place default error output in context/print for robust contract
        logging.error(f"Validation/Schema check error: {ex}")
        fallback = {'validated_intake': {}, 'validated_at': datetime.now(UTC).isoformat(), 'error': str(ex)}
        setContext('VALIDATION_ERROR', fallback)
        print(json.dumps(fallback))
        # Do not crash pipeline: output is always machine-parseable