const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

function printEnvSummary(envKeys) {
  console.log("Environment variables detected:")
  envKeys.forEach(k => console.log(`- ${k}`))
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

;(async () => {
  const requiredEnv = ["SIDECAR_BASE_URL"]
  const envKeys = ["SIDECAR_BASE_URL", "NOTIFY_WEBHOOK", "MEPP_INPUT_JSON", "SLA_REMINDER_SECONDS", "SLA_DEADLINE_SECONDS", "POLL_INTERVAL_SECONDS", "SLA_MAX_POLL_ITERS", "SLA_PROFILES_JSON", "CITY_NAME", "GEO_TERMS", "KEYWORDS", "MAX_RESULTS", "ALERTS_ENDPOINT", "URGENT_TERMS"]
  printEnvSummary(envKeys)
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.error(`FATAL: Missing required env var '${key}'`)
      process.exit(1)
    }
  }
  // --- Intake ---
  const MEPP = process.env.MEPP_INPUT_JSON
    ? safeParse(process.env.MEPP_INPUT_JSON, null)
    : {
        issue: {
          summary: "Pothole near main road",
          details: "Large pothole causing traffic issues",
          category: "road"
        },
        location: {
          lat: 18.52,
          lon: 73.85,
          address_text: "Main Road, Ward 5",
          ward: "Ward 5"
        },
        evidence: {
          photos: ["https://img.demo/pothole1.jpg"]
        },
        provenance: {
          channel: "mobile-app",
          raw_id: `DEMO-${uuidv4()}`
        }
      }
  console.log(process.env.MEPP_INPUT_JSON ? "MEPP Input: override from env used." : "MEPP Input: demo payload constructed.")

  // --- Idempotency ---
  const idemKey = MEPP?.provenance?.raw_id && MEPP?.provenance?.channel ? `${MEPP.provenance.raw_id}:${MEPP.provenance.channel}` : null
  const idemSet = idemKey ? new Set([idemKey]) : null
  if (idemKey && idemSet.has(idemKey)) {
    console.log(`Idempotency: case ${idemKey} seen (in-run only); continuing...`)
  }
  if (!idemKey) {
    console.log("Idempotency: information not present in payload; handling as non-idempotent.")
  }

  // --- Urgent Hazard Fast-Path ---
  const urgentTerms = (process.env.URGENT_TERMS || "")
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
  let urgentMatched = false
  if (process.env.ALERTS_ENDPOINT) {
    const cat = MEPP.issue.category?.toLowerCase() || ""
    const summ = MEPP.issue.summary?.toLowerCase() || ""
    if (urgentTerms.some(t => cat === t || summ.includes(t))) {
      urgentMatched = true
      const alertPayload = {
        source: { channel: "urgent-fast-path", url: "", publishedAt: new Date().toISOString() },
        issue: { summary: MEPP.issue.summary, details: MEPP.issue.details || "" },
        location: { text: MEPP.location.address_text || "" },
        evidence: { links: MEPP.evidence?.photos || [] },
        status: "PUBLIC_INTEREST_ALERT"
      }
      try {
        axios
          .post(process.env.ALERTS_ENDPOINT, alertPayload)
          .then(() => {
            console.log("Urgent alert posted to ALERTS_ENDPOINT.")
          })
          .catch(e => {
            console.log("Urgent alert post failed:", e?.response?.status || e.message)
          })
      } catch (e) {
        console.log("URGENT alert error:", e.message)
      }
    }
  }

  // --- Dedupe check ---
  let duplicate_of = null,
    similarity = null,
    distance_km = null
  try {
    const deRes = await axios.post(`${process.env.SIDECAR_BASE_URL}/dedupe`, { mepp: MEPP })
    duplicate_of = deRes?.data?.duplicate_of || null
    similarity = deRes?.data?.similarity
    distance_km = deRes?.data?.distance_km
    console.log(`Dedupe check: duplicate_of=${duplicate_of}, similarity=${similarity}, distance_km=${distance_km}`)
    if (duplicate_of) {
      console.log(`Known duplicate of ${duplicate_of}; exiting.`)
      process.exit(0)
    }
  } catch (e) {
    console.error(`Dedupe API error: ${e.message}`)
    process.exit(1)
  }

  // --- Credibility ---
  let score = null,
    hint = null,
    credibilityStatus = "OK"
  try {
    const scRes = await axios.post(`${process.env.SIDECAR_BASE_URL}/score`, { mepp: MEPP })
    score = scRes?.data?.score
    hint = scRes?.data?.hint
    console.log(`Credibility: score=${score}, hint=${hint}`)
    if (score < 0.65) {
      credibilityStatus = "NEEDS_INFO"
      const out = {
        case_id: idemKey || uuidv4(),
        credibility: { score, status: credibilityStatus },
        routing: {},
        sla: {},
        timestamp: new Date().toISOString()
      }
      console.log(JSON.stringify(out, null, 2))
      console.log("Runbook: Blocked for needs_info (score < 0.65); exit 0.")
      process.exit(0)
    }
  } catch (e) {
    console.error(`Score API error: ${e.message}`)
    process.exit(1)
  }

  // --- Routing ---
  let routing = { dest: "", confidence: 0, basis: [] }
  try {
    const routeRes = await axios.post(`${process.env.SIDECAR_BASE_URL}/route`, { mepp: MEPP })
    routing = {
      dest: routeRes?.data?.dest || "",
      confidence: routeRes?.data?.confidence || 0,
      basis: Array.isArray(routeRes?.data?.basis) ? routeRes.data.basis : []
    }
    console.log(`Routing: dest=${routing.dest}, confidence=${routing.confidence} (${routing.basis.slice(0, 2).join(";")})`)
  } catch (e) {
    console.error(`Routing API error: ${e.message}`)
    process.exit(1)
  }

  // --- Simulated filing ---
  const ticket_id = `TCKT-${uuidv4().slice(0, 7)}`
  const artifact_url = `https://artifact.demo/${ticket_id}`
  console.log(`Simulated filing done. ticket_id=${ticket_id}, artifact_url=${artifact_url}`)

  // --- SLA & Polling ---
  let reminder = 420,
    deadline = 1260
  let expected_update_by = null
  const now = Date.now()
  const slaProfiles = process.env.SLA_PROFILES_JSON ? safeParse(process.env.SLA_PROFILES_JSON, {}) : {}
  if (slaProfiles[routing.dest]) {
    reminder = Number(slaProfiles[routing.dest]?.reminder) || reminder
    deadline = Number(slaProfiles[routing.dest]?.deadline) || deadline
    console.log(`SLA: Using dest-specific SLA profile for ${routing.dest}.`)
  } else if (slaProfiles["default"]) {
    reminder = Number(slaProfiles["default"]?.reminder) || reminder
    deadline = Number(slaProfiles["default"]?.deadline) || deadline
    console.log("SLA: Using default SLA profile.")
  } else {
    reminder = Number(process.env.SLA_REMINDER_SECONDS) || 420
    deadline = Number(process.env.SLA_DEADLINE_SECONDS) || 1260
    console.log("SLA: Using global defaults.")
  }
  expected_update_by = new Date(now + deadline * 1000).toISOString()
  const pollInterval = Number(process.env.POLL_INTERVAL_SECONDS) || 30
  const pollCap = Number(process.env.SLA_MAX_POLL_ITERS) || 40
  let status = "FILED",
    reminded = false,
    escalated = false

  for (let pollIter = 1; pollIter <= pollCap; pollIter++) {
    try {
      const statusRes = await axios.get(`${process.env.SIDECAR_BASE_URL}/simulate_ulb_status?ticket_id=${ticket_id}`)
      status = statusRes?.data?.status || status
    } catch (e) {
      console.log(`Polling error at iter ${pollIter}: ${e.message}`)
    }
    const elapsed = Math.floor((Date.now() - now) / 1000)
    console.log(`[Polling] Iter=${pollIter}/${pollCap} status=${status} elapsed_s=${elapsed}`)
    if (elapsed > reminder && !reminded) {
      reminded = true
      console.log("[SLA] Reminder threshold crossed (demo).")
    }
    if (elapsed > deadline) {
      if (!escalated && process.env.NOTIFY_WEBHOOK) {
        escalated = true
        const payload = {
          case_id: idemKey || uuidv4(),
          ticket_id,
          artifact_url,
          routing,
          expected_update_by,
          credibility_score: score,
          timestamp: new Date().toISOString()
        }
        try {
          await axios.post(process.env.NOTIFY_WEBHOOK, payload)
          console.log("Escalation webhook POSTed.")
        } catch (e) {
          console.log("Escalation POST failed:", e?.response?.status || e.message)
        }
      } else {
        console.log("Escalation: webhook not configured. Breaking SLA polling loop.")
      }
      break
    }
    await new Promise(res => setTimeout(res, pollInterval * 1000))
  }

  // --- Output JSON ---
  const out = {
    case_id: idemKey || uuidv4(),
    credibility: { score, status: credibilityStatus },
    routing: routing,
    sla: {
      ticket_id,
      status,
      artifact_url,
      expected_update_by
    },
    timestamp: new Date().toISOString()
  }
  console.log(JSON.stringify(out, null, 2))
  // --- Runbook Summary ---
  console.log("Runbook:")
  console.log(`Case ${out.case_id}\n` + `Issue: ${MEPP.issue.summary} | Ward: ${MEPP.location.ward || ""}/${MEPP.location.address_text || ""}\n` + `Routing: ${routing.dest} (${routing.confidence}, basis: ${(routing.basis || []).slice(0, 2).join("; ")})\n` + `SLA: ${status} | Ticket: ${ticket_id} | UpdateBy: ${expected_update_by}\n` + `Reminder sent: ${reminded ? "Y" : "N"} | Escalated: ${escalated ? "Y" : "N"}`)
  process.exit(0)
})()
