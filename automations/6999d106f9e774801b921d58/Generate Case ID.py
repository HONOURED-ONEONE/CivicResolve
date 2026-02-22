from runtime import getContext, setContext
import logging
import hashlib
from typing import Dict, Any
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

def generate_case_id(data: Dict[str, Any]) -> str:
    """
    Generate a case ID using SHA256 hash from normalized input data.
    Args:
        data (Dict[str, Any]): Normalized input data as dict.
    Returns:
        str: The generated SHA256 case ID.
    """
    try:
        source_string = json.dumps(data, sort_keys=True)
        case_id = hashlib.sha256(source_string.encode('utf-8')).hexdigest()
        logging.info(f'Generated Case ID: {case_id}')
        return case_id
    except Exception as ex:
        logging.error(f'Case ID generation failed: {ex}')
        raise

if __name__ == "__main__":
    import os
    NORM_JSON = os.environ.get('NORMALIZED_INPUTS_JSON', '{}')
    try:
        norm_data = json.loads(NORM_JSON)
    except Exception as e:
        logging.error(f'Failed to parse normalized input: {e}')
        norm_data = {}
    case_id = generate_case_id(norm_data)
    setContext('CASE_ID', case_id)
    print(json.dumps({'case_id': case_id}))