import logging
import os
from typing import Dict, Any, List
from PIL import Image
import piexif
import hashlib
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

def process_photos(photo_paths: List[str]) -> List[Dict[str, Any]]:
    """
    Processes photos: reads EXIF data, computes SHA256 hash, and collects metadata.
    Args:
        photo_paths (List[str]): List of file paths to photos.
    Returns:
        List[Dict[str, Any]]: List of dicts with processed photo info (hash, exif, file path).
    """
    processed = []
    for path in photo_paths:
        try:
            with Image.open(path) as img:
                exif_data = img.info.get('exif')
                if exif_data:
                    metadata = piexif.load(exif_data)
                else:
                    metadata = {}
                img.seek(0)  # Reset file pointer if needed
                # Hash the image file
                with open(path, 'rb') as f:
                    sha256 = hashlib.sha256(f.read()).hexdigest()
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
    try:
        photo_paths = json.loads(PHOTO_PATHS)
    except Exception as e:
        logging.error(f'Failed to parse PHOTO_PATHS: {e}')
        photo_paths = []
    processed_photos = process_photos(photo_paths)
    print(json.dumps({'processed_photos': processed_photos}))
