// JSON schemas and types for shared contracts
module.exports = {
  MEPP_SCHEMA: {
    type: "object",
    properties: {
      version: { type: "string" },
      case_id: { type: "string" },
      created_at: { type: "string" },
      reporter: { type: "object" },
      issue: { type: "object" },
      evidence: { type: "object" },
      location: { type: "object" },
      credibility: { type: "object" },
      routing: { type: "object" },
      sla: { type: "object" },
      provenance: { type: "object" }
    }
  },
  VISION_EXTRACT_SCHEMA: {
    type: "object",
    properties: {
      summary: { type: "string" },
      category: { type: "string" },
      confidence: { type: "number" }
    }
  },
  DRAFT_ASSIST_SCHEMA: {
    type: "object",
    properties: {
      draft: { type: "string" }
    }
  },
  SEARCH_CITATIONS_SCHEMA: {
    type: "array",
    items: {
      type: "object",
      properties: {
        title: { type: "string" },
        url: { type: "string" },
        snippet: { type: "string" }
      }
    }
  },
  FILING_REQUEST_SCHEMA: {
    type: "object",
    properties: {
      case_id: { type: "string" },
      destination: { type: "string" },
      idempotency_key: { type: "string" },
      payload: { type: "object" },
      pack_url: { type: "string" }
    },
    required: ["case_id", "destination"]
  },
  FILING_RESPONSE_SCHEMA: {
    type: "object",
    properties: {
      status: { type: "string" },
      ticket_id: { type: "string" },
      connector: { type: "string" },
      pack_pdf: { type: "string" },
      metadata: { type: "object" },
      error: { type: "string" }
    },
    required: ["status", "connector"]
  },
  RECEIPT_SCHEMA: {
    type: "object",
    properties: {
      ticket_id: { type: "string" },
      case_id: { type: "string" },
      connector: { type: "string" },
      status: { type: "string" },
      filed_at: { type: "string" },
      pack_pdf: { type: "string" },
      metadata: { type: "object" }
    },
    required: ["ticket_id", "connector", "status", "filed_at"]
  }
};
