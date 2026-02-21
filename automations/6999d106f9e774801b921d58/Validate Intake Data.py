import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

def validate_intake_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates the intake data for required fields and proper formats.
    Args:
        data (Dict[str, Any]): Input data dictionary.
    Returns:
        Dict[str, Any]: Validated and sanitized data dictionary.
    Raises:
        ValueError: If validation fails due to missing or invalid fields.
    """
    try:
        required_fields = ['category', 'summary']
        for field in required_fields:
            if field not in data or not isinstance(data[field], str) or not data[field].strip():
                logging.error(f'Missing or invalid required field: {field}')
                raise ValueError(f'Missing or invalid required field: {field}')
        logging.info('Intake data successfully validated.')
        return data
    except Exception as ex:
        logging.error(f'Validation error: {ex}')
        raise

# Example integration of context: simply returns output, can assign to a shared context dict
if __name__ == "__main__":
    import os
    import json
    INPUT_JSON = os.environ.get('INTAKE_DATA_JSON', '{}')
    try:
        parsed = json.loads(INPUT_JSON)
    except Exception as e:
        logging.error(f'Failed to parse input JSON: {e}')
        raise
    validated = validate_intake_data(parsed)
    # If running in orchestrated workflow, assign to shared context.
    # e.g., context['validated_intake'] = validated
    print(json.dumps({'validated_intake': validated}))
