import logging
from typing import Dict, Any
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

def normalize_inputs(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes input data to standard formats and trims whitespace.
    Args:
        data (Dict[str, Any]): Validated intake data.
    Returns:
        Dict[str, Any]: Normalized input data.
    """
    try:
        normalized = {}
        for key, value in data.items():
            if isinstance(value, str):
                normalized[key] = value.strip().lower()
            else:
                normalized[key] = value
        logging.info('Input normalization successful.')
        return normalized
    except Exception as ex:
        logging.error(f'Normalization error: {ex}')
        raise

if __name__ == "__main__":
    import os
    PREV_OUTPUT = os.environ.get('VALIDATED_INTAKE_JSON', '{}')
    try:
        validated_intake = json.loads(PREV_OUTPUT)
    except Exception as e:
        logging.error(f'Failed to load previous step output: {e}')
        raise
    normalized = normalize_inputs(validated_intake)
    print(json.dumps({'normalized_inputs': normalized}))
