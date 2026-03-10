const express = require('express');
const axios = require('axios');
const config = require('@civicresolve/shared-config');
const { generateTraceId } = require('@civicresolve/shared-utils');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Gating Logic (Deterministic)
function computeGate(signal) {
  let E = 0;
  let L = 0;
  let C = 0;

  const photosCount = (signal.evidence?.photos || []).length;
  const linksCount = (signal.evidence?.links || []).length;
  if (photosCount >= 2) E = 1;
  else if (photosCount === 1) E = 0.7;
  else if (linksCount > 0) E = 0.4;

  const lat = signal.location?.lat;
  const lon = signal.location?.lon;
  const address = signal.location?.address;
  const ward = signal.location?.ward;
  if (lat && lon && address) L = 1;
  else if (address && ward) L = 0.7;
  else if (ward) L = 0.4;

  const summary = signal.issue?.summary;
  const category = signal.issue?.category;
  const details = signal.issue?.details;
  if (summary && category && details) C = 1;
  else if (summary && category) C = 0.7;
  else if (summary) C = 0.4;

  const content_confidence = Math.round((0.40 * E + 0.35 * L + 0.25 * C) * 100) / 100;
  const source_confidence = signal.source?.confidence || 0.55;
  const final_confidence = Math.round((source_confidence * content_confidence) * 100) / 100;

  let status = "action";
  if (final_confidence < 0.25) status = "reject_low_signal";
  else if (final_confidence < 0.55) status = "needs_info"; // DRAFT equivalent

  return {
    status,
    source_confidence,
    content_confidence,
    final_confidence
  };
}

app.post('/ingest', async (req, res) => {
  try {
    const signal = req.body;
    const traceId = generateTraceId();

    const gate = computeGate(signal);

    const mepp = {
      case_id: signal.ticket_id || traceId,
      issue: {
        summary: signal.issue?.summary,
        category: signal.issue?.category,
        details: signal.issue?.details
      },
      location: {
        lat: signal.location?.lat,
        lon: signal.location?.lon,
        address_text: signal.location?.address,
        ward: signal.location?.ward
      },
      evidence: {
        photos: signal.evidence?.photos || [],
        links: signal.evidence?.links || []
      },
      provenance: {
        channel: signal.source?.channel || 'unknown',
        raw_id: signal.source?.raw_id || traceId
      }
    };

    if (gate.status === "reject_low_signal") {
      return res.json({ status: "rejected", gate });
    }

    if (gate.status === "needs_info") {
      // Conditionally call AI Advisory if enabled
      if (config.ENABLE_AI_ADVISORY && config.ENABLE_DRAFT_ASSIST) {
        try {
          const draftRes = await axios.post(`${config.AI_ADVISORY_SERVICE_URL}/draft_assist`, { mepp }, { timeout: 5000 });
          if (draftRes.data && draftRes.data.draft) {
            mepp.issue.draft_assistance = draftRes.data.draft;
            mepp.issue.draft_derived = true;
          }
        } catch (e) {
          console.error(`[AI_ADVISORY_FAIL] /draft_assist failed, failing open: ${e.message}`);
        }
      }
      return res.json({ status: "needs_info", gate, mepp });
    }

    // Intelligence service calls (Deterministic, critical path)
    const intOpts = { mepp };
    let dedupe, cluster, score, route;
    
    try {
      [dedupe, cluster, score, route] = await Promise.all([
        axios.post(`${config.INTELLIGENCE_SERVICE_URL}/dedupe`, intOpts).then(r => {
          if (!r.data || typeof r.data.similarity !== 'number') throw new Error("Invalid dedupe response");
          return r.data;
        }),
        axios.post(`${config.INTELLIGENCE_SERVICE_URL}/cluster`, intOpts).then(r => {
          if (!r.data || !r.data.cluster_id) throw new Error("Invalid cluster response");
          return r.data;
        }),
        axios.post(`${config.INTELLIGENCE_SERVICE_URL}/score`, intOpts).then(r => {
          // Changed to accept 'score' as per intelligence-service rather than 'credibility_score' sometimes mapped
          // we just check if data is an object
          if (!r.data) throw new Error("Invalid score response");
          return r.data;
        }),
        axios.post(`${config.INTELLIGENCE_SERVICE_URL}/route`, intOpts).then(r => {
          if (!r.data || !r.data.dest) throw new Error("Invalid route response");
          return r.data;
        })
      ]);
    } catch (e) {
      console.error(`[INTELLIGENCE_FAIL] Critical intelligence dependency failed: ${e.message}`);
      return res.status(502).json({ error: "Upstream intelligence service unavailable or returned invalid data" });
    }

    if (dedupe.duplicate_of) {
      return res.json({ status: "duplicate", duplicate_of: dedupe.duplicate_of });
    }

    let pack;
    try {
      const packReq = { mepp, gating: gate, routing: route, cluster };
      const packRes = await axios.post(`${config.INTELLIGENCE_SERVICE_URL}/pack`, packReq);
      if (!packRes.data) throw new Error("Invalid pack response");
      pack = packRes.data;
    } catch (e) {
      console.error(`[INTELLIGENCE_FAIL] Pack generation failed: ${e.message}`);
      return res.status(502).json({ error: "Upstream pack generation failed" });
    }

    // Connector Service for Filing (Critical path)
    let filed;
    try {
      const filedRes = await axios.post(`${config.CONNECTOR_SERVICES_URL || config.CONNECTOR_SERVICE_URL}/file`, { mepp, pack, route });
      if (!filedRes.data || !filedRes.data.ticket_id) throw new Error("Invalid connector response");
      filed = filedRes.data;
    } catch (e) {
      console.error(`[CONNECTOR_FAIL] Filing failed: ${e.message}`);
      return res.status(502).json({ error: "Upstream connector service failed" });
    }

    // SLA Status Initialization (Fail-open)
    await axios.post(`${config.SLA_STATUS_SERVICE_URL}/sla/init`, {
      ticket_id: filed.ticket_id,
      dest: route.dest,
      pack_pdf: pack.pdf_url
    }).catch(e => console.error(`[SLA_FAIL] SLA init failed: ${e.message}`));

    // Governance metrics (Fail-open)
    await axios.post(`${config.GOVERNANCE_PLATFORM_URL}/metrics`, {
      event: 'case_orchestrated',
      ticket_id: filed.ticket_id,
      gate,
      route
    }).catch(e => console.error(`[GOVERNANCE_FAIL] Metric logging failed: ${e.message}`));

    res.json({
      status: "action",
      ticket_id: filed.ticket_id,
      connector_status: filed,
      gate,
      route,
      pack
    });

  } catch (error) {
    console.error(`[ORCHESTRATOR_ERROR] Unhandled exception: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

const port = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Case Orchestrator running on port ${port}`);
  });
}
module.exports = app;
