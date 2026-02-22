from runtime import getContext, setContext

def filing_connector_api_webform_fallback():
    """
    Uses FILING_INFO context, attaches QR path from context to artifact_url if present, outputs strictly nested output contract.
    """
    filing_info = getContext('FILING_INFO') or {}
    qr_path = getContext('QR_PATH')
    if qr_path:
        filing_info['artifact_url'] = qr_path
    setContext('FILING_INFO', filing_info)
    print(f'FILING_INFO with QR artifact attached: {filing_info}')

filing_connector_api_webform_fallback()