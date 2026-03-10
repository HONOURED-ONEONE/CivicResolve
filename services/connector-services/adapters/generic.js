// Generic Adapter (Fallback)

class GenericAdapter {
  async file(request) {
    // request is a normalized FILING_REQUEST_SCHEMA object
    // { case_id, destination, idempotency_key, payload, pack_url }
    
    // Simulate filing
    const ticket_id = `GEN-${Date.now()}`;
    
    return {
      status: "filed",
      ticket_id,
      connector: "generic",
      pack_pdf: request.pack_url,
      metadata: {
        simulated: true,
        original_destination: request.destination,
        message: "Filed via Generic fallback adapter"
      }
    };
  }
}

module.exports = new GenericAdapter();
