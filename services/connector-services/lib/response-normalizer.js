const { FILING_RESPONSE_SCHEMA } = require('@civicresolve/contracts');

function normalizeResponse(adapterResponse) {
  // adapterResponse should be a normalized object from the adapter
  // Ensure we map it to the FILING_RESPONSE_SCHEMA

  const response = {
    status: adapterResponse.status || "error",
    ticket_id: adapterResponse.ticket_id || null,
    connector: adapterResponse.connector || "generic",
    pack_pdf: adapterResponse.pack_pdf || null,
    metadata: adapterResponse.metadata || {},
    error: adapterResponse.error || null
  };

  // Validate against canonical contract
  for (const field of FILING_RESPONSE_SCHEMA.required || []) {
    if (!response[field]) {
      throw new Error(`Invalid Filing Response: Missing required field '${field}'`);
    }
  }

  return response;
}

module.exports = { normalizeResponse };
