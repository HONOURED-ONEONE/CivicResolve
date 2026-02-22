const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

function safeParse(json, fallback) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

;(async () => {
  // ENV summary
  const envKeys = ["SIDECAR_BASE_URL", "NOTIFY_WEBHOOK", "MEPP_INPUT_JSON", "SLA_REMINDER_SECONDS", "SLA_DEADLINE_SECONDS", "POLL_INTERVAL_SECONDS", "SLA_MAX_POLL_ITERS", "SLA_PROFILES_JSON", "ALERTS_ENDPOINT", "URGENT_TERMS"]
  envKeys.forEach(k => console.log(`ENV: ${k} => ${process.env[k] !== undefined}`))

  if (!process.env.SIDECAR_BASE_URL) {
    console.error("FATAL: SIDECAR_BASE_URL missing")
    process.exit(1)
  }

  // Intake strict normalization
  let MEPP = process.env.MEPP_INPUT_JSON ? safeParse(process.env.MEPP_INPUT_JSON, null) : null
  if (!MEPP || typeof MEPP != "object") MEPP = {}
  MEPP.issue = MEPP.issue || {}
  ;["summary", "details", "category"].forEach(k => (MEPP.issue[k] = typeof MEPP.issue[k] === "string" ? MEPP.issue[k] : ""))
  MEPP.location = MEPP.location || {}
  ;["address_text", "ward"].forEach(k => (MEPP.location[k] = typeof MEPP.location[k] === "string" ? MEPP.location[k] : ""))
  MEPP.location.lat = typeof MEPP.location.lat == "number" ? MEPP.location.lat : null
  MEPP.location.lon = typeof MEPP.location.lon == "number" ? MEPP.location.lon : null
  MEPP.evidence = MEPP.evidence || {}
  MEPP.evidence.photos = Array.isArray(MEPP.evidence.photos) ? MEPP.evidence.photos : []
  MEPP.provenance = MEPP.provenance || {}
  MEPP.provenance.channel = typeof MEPP.provenance.channel == "string" ? MEPP.provenance.channel : ""
  MEPP.provenance.raw_id = typeof MEPP.provenance.raw_id === "string" && MEPP.provenance.raw_id !== "" ? MEPP.provenance.raw_id : `AUTO-${uuidv4()}`

  // Idempotency LOG ONLY
  const idemKey = MEPP.provenance.raw_id && MEPP.provenance.channel ? `${MEPP.provenance.raw_id}:${MEPP.provenance.channel}` : null
  if (idemKey) console.log(`[Idempotency] Key: ${idemKey}`)
  else console.log("[Idempotency] Could not construct key")

  // Urgent fast-path
  let urgentMatched = null
  const ut = (typeof process.env.URGENT_TERMS == "string" ? process.env.URGENT_TERMS : "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
  let matchedTerm = null
  if (ut.length && process.env.ALERTS_ENDPOINT) {
    const cat = MEPP.issue.category.toLowerCase(),
      summary = MEPP.issue.summary.toLowerCase()
    for (const t of ut) {
      if (cat === t || summary.includes(t)) {
        urgentMatched = t
        try {
          const alertPayload = {
            source: { channel: "urgent-fast-path", url: "", publishedAt: new Date().toISOString() },
            issue: { summary: MEPP.issue.summary, details: MEPP.issue.details },
            location: { text: MEPP.location.address_text },
            evidence: { links: MEPP.evidence.photos },
            status: "PUBLIC_INTEREST_ALERT"
          }
          const res = await axios.post(process.env.ALERTS_ENDPOINT, alertPayload)
          console.log(`[FAST-PATH] URGENT '${t}' matched, POST = ${res.status}`)
        } catch (e) {
          console.log(`[FAST-PATH] URGENT '${t}' matched, POST FAILED (${e?.response?.status || e.message})`)
        }
        matchedTerm = t
        break
      }
    }
    if (!matchedTerm) console.log("[FAST-PATH] No urgent terms matched")
  } else if (ut.length && !process.env.ALERTS_ENDPOINT) {
    console.log("[FAST-PATH] ALERTS_ENDPOINT unset; urgent fast-path skipped.")
  } else {
    console.log("[FAST-PATH] No urgent terms provided.")
  }

  // --- Sidecar: dedupe ---
  let duplicate_of = null
  try {
    const deRes = await axios.post(`${process.env.SIDECAR_BASE_URL}/dedupe`, { mepp: MEPP })
    duplicate_of = deRes?.data?.duplicate_of || null
    if (duplicate_of) {
      console.log(`[DEDUPLICATE] Known duplicate of ${duplicate_of}. Exiting 0.`)
      process.exit(0)
    }
  } catch (e) {
    console.error(`[DEDUPLICATE] API error: ${e.message}`)
    process.exit(1)
  }

  // --- Sidecar: score ---
  let score = null,
    hint = null,
    credibilityStatus = "OK"
  try {
    const scRes = await axios.post(`${process.env.SIDECAR_BASE_URL}/score`, { mepp: MEPP })
    score = typeof scRes?.data?.score == "number" ? scRes.data.score : null
    hint = typeof scRes?.data?.hint === "string" ? scRes.data.hint : undefined
    if (score === null || score < 0.65) {
      credibilityStatus = "needs_info"
      // Minimum JSON OUT per schema:
      const out = {
        case_id: idemKey || uuidv4(),
        status: "needs_info",
        credibility: { score: score || 0, status: "needs_info", ...(hint ? { hint } : {}) },
        routing: { dest: "", confidence: 0, basis: [] },
        sla: { ticket_id: "", status: "BLOCKED", artifact_url: "", expected_update_by: "" },
        timestamp: new Date().toISOString()
      }
      console.log(JSON.stringify(out, null, 2))
      console.log("Runbook: Filing BLOCKED (credibility/needs_info).")
      process.exit(0)
    }
  } catch (e) {
    console.error(`[CREDIBILITY] API error: ${e.message}`)
    process.exit(1)
  }

  // --- Sidecar: route ---
  let routing = { dest: "", confidence: 0, basis: [] }
  try {
    const routeRes = await axios.post(`${process.env.SIDECAR_BASE_URL}/route`, { mepp: MEPP })
    routing.dest = typeof routeRes?.data?.dest === "string" ? routeRes.data.dest : ""
    routing.confidence = typeof routeRes?.data?.confidence === "number" ? routeRes.data.confidence : 0
    routing.basis = Array.isArray(routeRes?.data?.basis) ? routeRes.data.basis : []
  } catch (e) {
    console.error(`[ROUTING] API error: ${e.message}`)
    process.exit(1)
  }

  // --- Simulated filing ---
  const ticket_id = `TCKT-${uuidv4().slice(0, 7)}`
  const artifact_url = `https://artifact.demo/${ticket_id}`
  console.log(`[FILING] Simulated ticket: ${ticket_id}, artifact: ${artifact_url}`)

  // --- SLA profile selection
  let reminder = 420,
    deadline = 1260,
    profileSource = "global"
  let expected_update_by = ""
  const now = Date.now()
  const slaProfiles = process.env.SLA_PROFILES_JSON ? safeParse(process.env.SLA_PROFILES_JSON, {}) : {}
  if (routing.dest && slaProfiles[routing.dest]) {
    reminder = Number(slaProfiles[routing.dest]?.reminder) || reminder
    deadline = Number(slaProfiles[routing.dest]?.deadline) || deadline
    profileSource = "dest-specific"
  } else if (slaProfiles["default"]) {
    reminder = Number(slaProfiles["default"]?.reminder) || reminder
    deadline = Number(slaProfiles["default"]?.deadline) || deadline
    profileSource = "default"
  } else {
    reminder = Number(process.env.SLA_REMINDER_SECONDS) || reminder
    deadline = Number(process.env.SLA_DEADLINE_SECONDS) || deadline
    profileSource = "global"
  }
  expected_update_by = new Date(now + deadline * 1000).toISOString()
  console.log(`[SLA_PROFILE] ${profileSource}, reminder=${reminder}, deadline=${deadline}`)

  // --- SLA polling ---
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
      console.log(`[Polling] Error at iter ${pollIter}: ${e.message}`)
    }
    const elapsed = Math.floor((Date.now() - now) / 1000)
    console.log(`[POLL] Iter=${pollIter}/${pollCap} status=${status} elapsed_s=${elapsed}`)
    if (elapsed > reminder && !reminded) {
      console.log(`[SLA] Reminder threshold crossed @ ${elapsed}s.`)
      reminded = true
    }
    if (elapsed > deadline) {
      if (!escalated && process.env.NOTIFY_WEBHOOK) {
        escalated = true
        try {
          const escRes = await axios.post(process.env.NOTIFY_WEBHOOK, {
            case_id: idemKey || uuidv4(),
            ticket_id,
            artifact_url,
            routing,
            expected_update_by,
            credibility_score: score,
            timestamp: new Date().toISOString()
          })
          console.log(`[ESCALATE] Webhook POST status=${escRes.status}`)
        } catch (e) {
          console.log(`[ESCALATE] Webhook POST failed: ${e?.response?.status || e.message}`)
        }
      } else if (elapsed > deadline && !escalated) {
        console.log("[ESCALATE] skipped/escalated")
      }
      break
    }
    await new Promise(res => setTimeout(res, pollInterval * 1000))
  }

  // --- Output ---
  const out = {
    case_id: idemKey || uuidv4(),
    status: "ok",
    credibility: { score: score || 0, status: credibilityStatus || (score < 0.65 ? "needs_info" : "OK"), ...(hint ? { hint } : {}) },
    routing: { dest: routing.dest, confidence: routing.confidence, basis: routing.basis || [] },
    sla: {
      ticket_id: ticket_id || "",
      status: status || "",
      artifact_url: artifact_url || "",
      expected_update_by: expected_update_by || ""
    },
    timestamp: new Date().toISOString()
  }
  console.log(JSON.stringify(out, null, 2))
  // Runbook
  console.log("Runbook summary:")
  console.log(`Case ${out.case_id}\n` + `Issue: ${MEPP.issue.summary} | Ward: ${MEPP.location.ward}/${MEPP.location.address_text}\n` + `Routing dest: ${out.routing.dest} (${out.routing.confidence}), basis: ${(out.routing.basis || []).slice(0, 2).join(";")}\n` + `SLA: ticket_id=${ticket_id}, status=${status}, expected_update_by=${expected_update_by}\n` + `Reminder sent: ${reminded ? "Y" : "N"} | Escalated: ${escalated ? "Y" : "N"}`)

  process.exit(0)
})()
