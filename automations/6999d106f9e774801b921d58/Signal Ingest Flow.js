const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

// --- Helper: Exponential backoff for API retries ---
async function backoffApiCall(fn, attempts = 3, baseMs = 240, label = "") {
  let lastErr = null
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fn()
      return res
    } catch (err) {
      lastErr = err
      if (i < attempts) {
        const wait = baseMs * Math.pow(2, i - 1)
        console.log(`[RETRY] ${label} attempt ${i}/${attempts} failed: ${err?.message || err}. Backing off ${wait}ms.`)
        await new Promise(res => setTimeout(res, wait))
      }
    }
  }
  throw lastErr
}

function nowIso() {
  return new Date().toISOString()
}
function msElapsed(start) {
  return Date.now() - start
}
function safeParse(json, fallback) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

;(async () => {
  const start = Date.now()
  // 1. Parse signal input as per contract (input via context or env)
  const signal = typeof getContext === "function" ? getContext("signal_input") : null
  if (!signal) {
    console.error("FATAL: No signal payload provided")
    process.exit(1)
  }
  // Schema-guard: Ensure required fields
  if (!signal.source || !signal.source.channel || !signal.issue || !signal.issue.summary) {
    console.log("[SCHEMA] Missing required: source.channel or issue.summary")
    setContext("outcome", "malformed_payload")
    process.exit(0)
  }

  // --- Urgent Signal Alert (fire-and-forget to NOTIFY_WEBHOOK) ---
  const urgentTerms = (process.env.URGENT_TERMS || "flood,sewage overflow").split(",").map(s => s.trim().toLowerCase())
  const thisCat = ((signal.issue && signal.issue.category) || "").toLowerCase()
  if (urgentTerms.includes(thisCat)) {
    // Compose alert content: prefer pack if already present, else signal summary
    let packLink = signal.pack && signal.pack.pdf_url ? signal.pack.pdf_url : null
    let summary = signal.issue.summary || ""
    let alertText = packLink ? `URGENT ALERT: [${thisCat}] - ${summary} | Pack: ${packLink}` : `URGENT ALERT: [${thisCat}] - ${summary}`
    const alertPayload = {
      type: "URGENT_ALERT",
      category: thisCat,
      summary: alertText,
      pack: packLink || null,
      signal_summary: summary,
      ts: nowIso()
    }
    ;(async () => {
      try {
        await axios.post(process.env.NOTIFY_WEBHOOK, alertPayload)
        console.log(`[ALERT] Urgent category '${thisCat}' alert posted to NOTIFY_WEBHOOK`, alertPayload)
      } catch (e) {
        console.log(`[ALERT][WARN] Failed to POST urgent alert to NOTIFY_WEBHOOK`, e && e.message)
      }
    })()
  }

  // Prepare contract context
  const ctx = { signal, gating: {}, mepp: {}, cluster: {}, routing: {}, pack: {}, ticket_id: "", idemKey: "" }
  ctx.idemKey = `${signal.source.raw_id || ""}:${signal.source.channel || ""}`
  setContext("idemKey", ctx.idemKey)

  // Idempotency: check processed in last 24h?
  // NOTE: Here, ideally Sidecar /dedupe or a persistent key store. For now, treat as not seen for contract-consistent demo.
  // If duplicate: short-circuit
  // (In real deployment, replace with Redis, Sidecar-dedupe, or similar persistent check)

  // Deterministic gating (confidence): content + source
  const tiers = safeParse(process.env.TIER_CONF_JSON, {})
  const thAction = Number(process.env.THRESHOLD_ACTION) || 0.55
  const thDraft = Number(process.env.THRESHOLD_DRAFT) || 0.25
  const channel = signal.source.channel || ""
  // Content confidence (basic: evidence/photos, location/clarity)
  const contentConf = (() => {
    let conf = 0.1
    if (signal.issue && signal.issue.summary && signal.issue.details) conf += 0.15
    if (signal.evidence && Array.isArray(signal.evidence.photos) && signal.evidence.photos.length >= 2) conf += 0.15
    if (signal.location && signal.location.lat && signal.location.lon) conf += 0.2
    if (signal.location && signal.location.address) conf += 0.1
    if (signal.location && signal.location.ward) conf += 0.05
    return Math.min(1, conf)
  })()
  const sourceConf = typeof tiers[channel] === "number" ? tiers[channel] : 0.1
  const finalConf = Math.max(0, Math.min(1, sourceConf * contentConf))
  let gateStatus,
    missing = []

  if (finalConf < thDraft) {
    gateStatus = "reject_low_signal"
  } else if (finalConf < thAction) {
    gateStatus = "needs_info"
    if (!Array.isArray(signal.evidence?.photos) || signal.evidence.photos.length < 2) missing.push("2_photos")
    if (!signal.location?.address) missing.push("address")
  } else {
    gateStatus = "proceed"
  }
  ctx.gating = { gateStatus, contentConf, sourceConf, finalConf, missingFields: missing }
  setContext("gating", ctx.gating)

  if (gateStatus !== "proceed") {
    // Human-readable summary and exit
    const summary = `[GATE] Status=${gateStatus}, content_confidence=${contentConf}, source_confidence=${sourceConf}, final_confidence=${finalConf}, missing=${missing.join(",")}`
    setContext("outcome", summary)
    console.log(summary)
    process.exit(0)
  }

  // --- MEPP Mapping (Sidecar expects fields) ---
  ctx.mepp = {
    issue: {
      summary: signal.issue.summary || "",
      details: signal.issue.details || "",
      category: signal.issue.category || ""
    },
    location: {
      lat: signal.location?.lat || null,
      lon: signal.location?.lon || null,
      address: signal.location?.address || "",
      ward: signal.location?.ward || ""
    },
    evidence: {
      photos: Array.isArray(signal.evidence?.photos) ? signal.evidence.photos : []
    },
    provenance: {
      channel: channel,
      raw_id: signal.source.raw_id || uuidv4()
    }
  }
  setContext("mepp", ctx.mepp)

  // --- Call Sidecar /dedupe (exponential retry) ---
  const BASE_URL = (process.env.SIDECAR_BASE_URL || "").replace(/\/$/, "")
  async function sidecarPost(path, payload) {
    return backoffApiCall(() => axios.post(`${BASE_URL}${path}`, payload), 3, 450, path)
  }
  let dedupeRes = {}
  try {
    dedupeRes = (await sidecarPost("/dedupe", { mepp: ctx.mepp })).data || {}
    if (dedupeRes.duplicate_of) {
      ctx.duplicate_of = dedupeRes.duplicate_of
      setContext("outcome", "duplicate_detected")
      console.log(`[DEDUPLICATE] Found duplicate: ${dedupeRes.duplicate_of}`)
      process.exit(0)
    }
  } catch (e) {
    console.error(`[DEDUPLICATE] API error: ${e.message}`)
    setContext("outcome", "sidecar_dedupe_error")
    process.exit(1)
  }

  // --- Sidecar /cluster ---
  try {
    ctx.cluster = (await sidecarPost("/cluster", { mepp: ctx.mepp })).data || {}
    setContext("cluster", ctx.cluster)
  } catch (e) {
    console.error(`[CLUSTER] API error: ${e.message}`)
    setContext("outcome", "sidecar_cluster_error")
    process.exit(1)
  }

  // --- Sidecar /score ---
  try {
    ctx.score = (await sidecarPost("/score", { mepp: ctx.mepp })).data?.score || 0
    setContext("score", ctx.score)
  } catch (e) {
    console.error(`[SCORE] API error: ${e.message}`)
    setContext("outcome", "sidecar_score_error")
    process.exit(1)
  }

  // --- Sidecar /route ---
  try {
    ctx.routing = (await sidecarPost("/route", { mepp: ctx.mepp })).data || {}
    setContext("routing", ctx.routing)
  } catch (e) {
    console.error(`[ROUTE] API error: ${e.message}`)
    setContext("outcome", "sidecar_route_error")
    process.exit(1)
  }

  // --- Sidecar /pack ---
  try {
    ctx.pack = (await sidecarPost("/pack", { mepp: ctx.mepp, gating: ctx.gating, routing: ctx.routing, cluster: ctx.cluster })).data || {}
    setContext("pack", ctx.pack)
  } catch (e) {
    console.error(`[PACK] API error: ${e.message}`)
    setContext("outcome", "sidecar_pack_error")
    process.exit(1)
  }

  // --- Connector Dispatch Logic ---
  ctx.ticket_id = ""
  let connectorType = "",
    connectorOk = false
  const routingDest = ctx.routing.dest || ""
  if (routingDest.match(/swachhata/i) && process.env.CONNECTOR_SWACHHATA_ENABLED === "true") {
    connectorType = "Swachhata"
    connectorOk = true
    // ...Connector: Swachhata call here...
  } else if (routingDest.match(/cpgrams/i) && process.env.CONNECTOR_CPGRAMS_ENABLED === "true") {
    connectorType = "CPGRAMS"
    connectorOk = true
    // ...Connector: CPGRAMS call here...
  } else if (routingDest.match(/tncm/i) && process.env.CONNECTOR_TNCM_ENABLED === "true") {
    connectorType = "TNCM"
    connectorOk = true
    // ...Connector: TNCM call here...
  } else {
    connectorType = "None"
    setContext("outcome", "no_connector_enabled")
  }

  if (connectorOk) {
    // Simulated: In real, call respective Connector API and extract ticket_id
    ctx.ticket_id = `${connectorType}-${uuidv4().slice(0, 8)}`
    setContext("ticket_id", ctx.ticket_id)
  } else if (!ctx.ticket_id) {
    ctx.ticket_id = "not_created_no_connector"
  }

  // --- SLA Schedule (enqueue) ---
  const reminderS = Number(process.env.REMINDER_SECONDS) || 3600
  const deadlineS = Number(process.env.DEADLINE_SECONDS) || 86400
  // SLA job payload
  const slaPayload = {
    ticket_id: ctx.ticket_id,
    dest: ctx.routing.dest,
    pack_pdf: ctx.pack.pdf_url,
    reminder_s: reminderS,
    deadline_s: deadlineS
  }
  // Simulate enqueue (normally would hit another endpoint, message bus, etc)
  setContext("sla_payload", slaPayload)
  setContext("sla_delay", reminderS)

  // --- Summary and structured logs ---
  const artifacts = []
  if (ctx.pack && ctx.pack.pdf_url) artifacts.push(ctx.pack.pdf_url)
  if (ctx.pack && ctx.pack.json_url) artifacts.push(ctx.pack.json_url)
  const runbook = {
    gate_status: gateStatus,
    cluster_id: ctx.cluster.cluster_id || "",
    route_dest: ctx.routing.dest || "",
    ticket_id: ctx.ticket_id || "",
    pack_id: ctx.pack.pack_id || "",
    artifact_links: artifacts,
    elapsed_ms: msElapsed(start),
    next_update: nowIso(new Date(Date.now() + reminderS * 1000))
  }
  setContext("runbook", runbook)
  console.log("[RUNBOOK]", JSON.stringify(runbook))
  process.exit(0)
})()
