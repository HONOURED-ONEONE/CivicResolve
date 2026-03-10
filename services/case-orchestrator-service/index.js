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
          const draftRes = await axios.post(`${config.AI_ADVISORY_SERVICE_URL}/draft_assist`, { mepp });
          mepp.issue.draft_assistance = draftRes.data.draft;
          mepp.issue.draft_derived = true;
        } catch (e) {
          console.error("AI Advisory /draft_assist failed, failing open");
        }
      }
      return res.json({ status: "needs_info", gate, mepp });
    }

    // Intelligence service calls
    const intOpts = { mepp };
    const [dedupe, cluster, score, route] = await Promise.all([
      axios.post(`${config.INTELLIGENCE_SERVICE_URL}/dedupe`, intOpts).then(r => r.data).catch(() => ({})),
      axios.post(`${config.INTELLIGENCE_SERVICE_URL}/cluster`, intOpts).then(r => r.data).catch(() => ({})),
      axios.post(`${config.INTELLIGENCE_SERVICE_URL}/score`, intOpts).then(r => r.data).catch(() => ({})),
      axios.post(`${config.INTELLIGENCE_SERVICE_URL}/route`, intOpts).then(r => r.data).catch(() => ({}))
    ]);

    if (dedupe.duplicate_of) {
      return res.json({ status: "duplicate", duplicate_of: dedupe.duplicate_of });
    }

    const packReq = { mepp, gating: gate, routing: route, cluster };
    const pack = await axios.post(`${config.INTELLIGENCE_SERVICE_URL}/pack`, packReq).then(r => r.data).catch(() => ({}));

    // Connector Service for Filing
    const filed = await axios.post(`${config.CONNECTOR_SERVICE_URL}/file`, { mepp, pack, route }).then(r => r.data).catch(() => ({ status: 'stub_filed', ticket_id: mepp.case_id }));

    // SLA Status Initialization
    await axios.post(`${config.SLA_STATUS_SERVICE_URL}/sla/init`, {
      ticket_id: filed.ticket_id,
      dest: route.dest,
      pack_pdf: pack.pdf_url
    }).catch(e => console.error("SLA init failed", e.message));

    // Governance metrics
    await axios.post(`${config.GOVERNANCE_PLATFORM_URL}/metrics`, {
      event: 'case_orchestrated',
      ticket_id: filed.ticket_id,
      gate,
      route
    }).catch(() => {});

    res.json({
      status: "action",
      ticket_id: filed.ticket_id,
      connector_status: filed,
      gate,
      route,
      pack
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Case Orchestrator running on port ${port}`);
});
