from runtime import getContext, setContext
import logging
import os
from typing import Dict, Any, List
from PIL import Image
import piexif
import hashlib
import json
from datetime import datetime, UTC

def strip_gps_from_exif(exif_dict):
    if 'GPS' in exif_dict:
        exif_dict['GPS'] = {}  # Remove all GPS tags
    return exif_dict

def process_photos(photo_paths: List[str], anonymity_requested: bool) -> List[Dict[str, Any]]:
    processed = []
    for path in photo_paths:
        try:
            with Image.open(path) as img:
                exif_data = img.info.get('exif')
                if exif_data:
                    metadata = piexif.load(exif_data)
                else:
                    metadata = {}
                img.seek(0)
                with open(path, 'rb') as f:
                    sha256 = hashlib.sha256(f.read()).hexdigest()
                if anonymity_requested:
                    metadata = strip_gps_from_exif(metadata)
                processed.append({
                    'file_path': path,
                    'sha256': sha256,
                    'exif': metadata
                })
                logging.info(f'Processed photo: {path} | SHA256: {sha256}')
        except Exception as ex:
            logging.error(f'Failed to process photo {path}: {ex}')
            continue
    return processed

if __name__ == "__main__":
    PHOTO_PATHS = os.environ.get('PHOTO_PATHS', '[]')
    NORMALIZED_INPUTS = os.environ.get('NORMALIZED_INPUTS_JSON', '{}')
    try:
        photo_paths = json.loads(PHOTO_PATHS)
    except Exception as e:
        logging.error(f'Failed to parse PHOTO_PATHS: {e}')
        photo_paths = []
    try:
        norm_inputs = json.loads(NORMALIZED_INPUTS)
        anonymity_requested = bool(norm_inputs.get('normalized_inputs', norm_inputs).get('reporter', {}).get('anonymity_requested', False))
    except Exception as e:
        anonymity_requested = False
    processed_photos = process_photos(photo_paths, anonymity_requested)
    out = {'processed_photos': processed_photos, 'processed_at': datetime.now(UTC).isoformat()}
    setContext('PROCESSED_PHOTOS', out)
    print(json.dumps(out))