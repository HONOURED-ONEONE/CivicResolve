import hashlib
import json
from typing import Dict

def generate_mepp_signature() -> None:
    """
    Canonicalizes and signs the MEPP JSON (using SHA256 over sorted JSON keys).
    Saves the base64 digest as 'MEPP_SIGNATURE' in context for downstream use.
    """
    mepp = getContext('MEPP_JSON')
    if not mepp:
        print("No MEPP found, cannot sign.")
        return
    # Canonicalize (JSON dump with sorted keys, no whitespace changes)
    canonical = json.dumps(mepp, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode('utf-8')
    digest = hashlib.sha256(canonical).hexdigest()
    setContext('MEPP_SIGNATURE', digest)
    print(f"Signed MEPP. case_id={mepp.get('case_id', 'N/A')} signature={digest}")

generate_mepp_signature()