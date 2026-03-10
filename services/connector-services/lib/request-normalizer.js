const { FILING_REQUEST_SCHEMA } = require('@civicresolve/contracts');

function normalizeRequest(rawPayload) {
  // rawPayload is the orchestrator payload:
  // { mepp: { case_id: ... }, route: { dest: ... }, pack: { pdf_url: ... } }
  
  const mepp = rawPayload.mepp || {};
  const case_id = mepp.case_id || `case-${Date.now()}`;
  const route = rawPayload.route || {};
  const destination = route.dest || 'generic';
  const pack = rawPayload.pack || {};
  const pack_url = pack.pdf_url || null;

  // Derive an idempotency key if not explicitly provided
  const idempotency_key = rawPayload.idempotency_key || `${case_id}-${destination}`;

  const request = {
    case_id,
    destination,
    idempotency_key,
    payload: mepp,
    pack_url
  };

  // Validate against canonical contract
  for (const field of FILING_REQUEST_SCHEMA.required || []) {
    if (!request[field]) {
      throw new Error(`Invalid Filing Request: Missing required field '${field}'`);
    }
  }

  return request;
}

module.exports = { normalizeRequest };
