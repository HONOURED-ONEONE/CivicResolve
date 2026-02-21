import logging
import os
import json
import qrcode
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

def generate_qr_code(data: Dict[str, Any], output_file: str = 'qr_code.png') -> str:
    """
    Generate a QR code PNG from input data and save to output_file.
    Args:
        data (Dict[str, Any]): Data to encode as QR code (typically MEPP JSON or case ID).
        output_file (str): Output file path for PNG.
    Returns:
        str: Output file path of generated QR PNG.
    """
    try:
        qr_data = json.dumps(data, sort_keys=True)
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M)
        qr.add_data(qr_data)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(output_file)
        logging.info(f'QR code generated and saved as {output_file}')
        return output_file
    except Exception as ex:
        logging.error(f'QR code generation failed: {ex}')
        raise

if __name__ == "__main__":
    QR_INPUT = os.environ.get('QR_INPUT_JSON', '{}')
    OUTPUT_FILE = os.environ.get('QR_OUTPUT_FILE', 'qr_code.png')
    try:
        qr_dict = json.loads(QR_INPUT)
    except Exception as e:
        logging.error(f'Failed to parse QR input JSON: {e}')
        qr_dict = {}
    fpath = generate_qr_code(qr_dict, OUTPUT_FILE)
    print(json.dumps({'qr_code_path': fpath}))
