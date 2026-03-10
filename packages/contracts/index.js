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
  }
};
