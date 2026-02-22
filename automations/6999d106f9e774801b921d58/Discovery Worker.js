const axios = require("axios")

function parseCsv(str) {
  if (typeof str !== "string" || !str.trim()) return []
  return str.split(",").map(x => (x || "").trim()).filter(Boolean)
}

function robustAxios(method, url, payload = undefined) {
  const start = Date.now()
  return axios({
    method,
    url,
    data: payload,
    timeout: method === "GET" ? 8000 : 15000
  })
    .then(res => {
      const latency = Date.now() - start
      console.log(`[HTTP] ${method} ${url} status=${res.status} latency_ms=${latency}`)
      return res
    })
    .catch(e => {
      const latency = Date.now() - start
      console.error(`[HTTP] ${method} ${url} ERROR (${e?.response?.status || e.message}) latency_ms=${latency}`)
      throw e
    })
}

;(async () => {
  // Detect and print env
  const envKeys = ["CITY_NAME", "GEO_TERMS", "KEYWORDS", "MAX_RESULTS", "ALERTS_ENDPOINT", "DISCOVERY_THROTTLE_MS"]
  envKeys.forEach(k => console.log(`ENV: ${k} => ${process.env[k] !== undefined}`))
  const CITY_NAME = typeof process.env.CITY_NAME === "string" ? process.env.CITY_NAME.trim() : ""
  const GEO_TERMS = parseCsv(process.env.GEO_TERMS)
  let KEYWORDS = parseCsv(process.env.KEYWORDS)
  const MAX_RESULTS = Math.max(1, Number(process.env.MAX_RESULTS) || 10)
  const ALERTS_ENDPOINT = typeof process.env.ALERTS_ENDPOINT === "string" ? process.env.ALERTS_ENDPOINT.trim() : ""
  const THROTTLE_MS = Math.max(500, Number(process.env.DISCOVERY_THROTTLE_MS) || 3000)

  // Query generation with contract-mandated fallback
  let queries = []
  if (CITY_NAME) queries.push(CITY_NAME)
  if (GEO_TERMS && GEO_TERMS.length) {
    GEO_TERMS.forEach(t => {
      if (t && !queries.includes(t)) queries.push(t)
    })
  }
  if (KEYWORDS && KEYWORDS.length) {
    KEYWORDS.forEach(k => {
      if (k && !queries.includes(k)) queries.push(k)
    })
  } else if (CITY_NAME) {
    // Fallback minimal query if City provided but no keywords set
    const fallback = `${CITY_NAME} civic complaint`
    if (!queries.includes(fallback)) queries.push(fallback)
    console.log(`[FALLBACK] Added minimal fallback query: '${fallback}'`)
  }
  queries = queries.filter(Boolean).slice(0, MAX_RESULTS)

  // If all sources are empty, discovery skipped (never fatal)
  if (!queries.length) {
    console.warn("[WARN] No queries configured; discovery skipped.")
    console.log(`[REPORT] civic_issues: 0, alerts_posted: 0, evidence_saved: 0, note: \"discovery skipped\"")
    process.exit(0)
  }
  console.log(`[QUERIES] ${queries.length} issued, MAX_RESULTS=${MAX_RESULTS}`)

  let dedupeUrls = new Set()
  let allResults = [], posted = 0, skipped = 0, fetched = 0
  for (const query of queries) {
    console.log(`[SEARCH] Query: ${query}`)
    let search
    try {
      search = await searchWebWithTurboticAI(query, { maxResults: MAX_RESULTS })
      const validResults = Array.isArray(search?.usage?.results) ? search.usage.results : []
      if (!validResults.length) {
        console.log(`[WARN] No valid results for '${query}'.`)
        continue
      }
      for (const result of validResults) {
        if (!result.url || dedupeUrls.has(result.url)) {
          skipped++
          continue
        }
        dedupeUrls.add(result.url)
        allResults.push(result)
        fetched++
        if (fetched >= MAX_RESULTS) break
      }
    } catch (e) {
      console.log(`[ERROR] Search for '${query}' failed: ${e.message}`)
    }
    if (fetched >= MAX_RESULTS) break
  }
  allResults = allResults.filter(r => r && r.url).slice(0, MAX_RESULTS)

  let alertWarned = false
  let evidence_saved = 0
  for (const result of allResults) {
    let html = "", summaryText = ""
    let publishedAtIso = result.publishedAt || new Date().toISOString()
    try {
      const res = await robustAxios("GET", result.url)
      html = res.data || ""
      let summary = typeof simplifyHtml === "function" ? await simplifyHtml(html) : ""
      if (typeof summary === "object" && summary !== null) summaryText = summary.text || JSON.stringify(summary)
      else summaryText = summary || ""
    } catch (e) {
      summaryText = "Summary unavailable."
    }
    try {
      await publishScreenshot(result.url)
      evidence_saved++
      console.log(`[EVIDENCE] Screenshot for ${result.url}`)
    } catch (e) {
      console.log(`[EVIDENCE] Screenshot fail: ${e.message}`)
    }
    if (ALERTS_ENDPOINT) {
      const payload = {
        source: {
          channel: "discovery:web",
          url: result.url,
          publishedAt: publishedAtIso
        },
        issue: {
          summary: result.title || result.snippet || result.url || "",
          details: summaryText
        },
        location: {
          text: result.snippet || ""
        },
        evidence: {
          links: [result.url]
        },
        status: "PUBLIC_INTEREST_ALERT"
      }
      try {
        await robustAxios("POST", ALERTS_ENDPOINT, payload)
        posted++
        console.log(`[ALERT] POSTED: ${result.url}`)
      } catch (e) {
        console.log(`[ALERT] POST FAIL: ${e?.response?.status || e.message}`)
      }
    } else if (!alertWarned) {
      alertWarned = true
      console.log(`[ALERT] alerts disabled; skipping posts`)
    }
    await new Promise(res => setTimeout(res, THROTTLE_MS))
  }

  console.log(`[REPORT] civic_issues: ${queries.length}, alerts_posted: ${posted}, evidence_saved: ${evidence_saved}, note: "${queries.length > 0 ? 'done' : 'discovery skipped'}"`)
  process.exit(0)
})()
