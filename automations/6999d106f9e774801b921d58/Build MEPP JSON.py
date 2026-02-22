from runtime import getContext, setContext
import hashlib
import json
from datetime import datetime, UTC
from typing import Any, Dict

def build_mepp_json() -> None:
    """
    Assemble the MEPP JSON from upstream context results.
    Composed as strictly nested schema only, including evidence/photos,
    QR artifact path, and conditional EXIF stripping on anonymity requests.
    """
    # Retrieve prior context
    norm = getContext('NORMALIZED_INPUTS_JSON')
    processed_photos_out = getContext('PROCESSED_PHOTOS')
    case_id = getContext('CASE_ID')
    intake = getContext('VALIDATED_INTAKE_JSON')
    qr_path = getContext('QR_PATH')
    # Compose evidence.photos as list of dicts (sha256, exif, file_path)
    processed_photos = []
    if processed_photos_out and 'processed_photos' in processed_photos_out:
        processed_photos = processed_photos_out['processed_photos']
    # If anonymity requested, strip GPS EXIF from photos
    anonymity = norm.get('normalized_inputs', norm).get('reporter', {}).get('anonymity_requested', False)
    def strip_gps_all(photo_dicts):
        for p in photo_dicts:
            if 'exif' in p and p['exif'] and 'GPS' in p['exif']:
                p['exif']['GPS'] = {}
        return photo_dicts
    if anonymity:
        processed_photos = strip_gps_all(processed_photos)
    # Compose provenance
    provenance = intake.get('provenance', {}) if intake else {}
    if qr_path:
        provenance['qr_path'] = qr_path
    mepp = {
        "version": "1.0",
        "case_id": case_id,
        "created_at": datetime.now(UTC).isoformat(),
        "reporter": intake.get("reporter", {}),
        "issue": norm.get("normalized_inputs", norm).get("MEPP", {}).get("issue", {}),
        "evidence": {"photos": processed_photos},
        "location": norm.get("normalized_inputs", norm).get("MEPP", {}).get("location", {}),
        "credibility": {},
        "routing": {},
        "sla": {},
        "provenance": provenance
    }
    setContext('MEPP_JSON', mepp)
    print(json.dumps({'MEPP_JSON': mepp}))

build_mepp_json()