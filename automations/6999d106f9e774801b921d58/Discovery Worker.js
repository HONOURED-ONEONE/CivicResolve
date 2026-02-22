const axios = require("axios")

function parseCsv(str) {
  if (typeof str !== "string" || !str) return []
  return str
    .split(",")
    .map(x => (x || "").trim())
    .filter(Boolean)
}

;(async () => {
  // Detect and print env
  const envKeys = ["CITY_NAME", "GEO_TERMS", "KEYWORDS", "MAX_RESULTS", "ALERTS_ENDPOINT", "DISCOVERY_THROTTLE_MS"]
  envKeys.forEach(k => console.log(`ENV: ${k} => ${process.env[k] !== undefined}`))
  const CITY_NAME = typeof process.env.CITY_NAME === "string" ? process.env.CITY_NAME : ""
  const GEO_TERMS = parseCsv(process.env.GEO_TERMS)
  const KEYWORDS = parseCsv(process.env.KEYWORDS)
  const MAX_RESULTS = Math.max(1, Number(process.env.MAX_RESULTS) || 10)
  const ALERTS_ENDPOINT = typeof process.env.ALERTS_ENDPOINT === "string" ? process.env.ALERTS_ENDPOINT : ""
  const THROTTLE_MS = Math.max(500, Number(process.env.DISCOVERY_THROTTLE_MS) || 3000)

  // Query generation
  let queries = []
  if (CITY_NAME) queries.push(CITY_NAME)
  GEO_TERMS.forEach(t => {
    if (t && !queries.includes(t)) queries.push(t)
  })
  KEYWORDS.forEach(k => {
    if (k && !queries.includes(k)) queries.push(k)
  })
  queries = queries.slice(0, MAX_RESULTS)
  if (!queries.length) {
    console.error("[FATAL] No queries constructed. Exiting 1.")
    process.exit(1)
  }
  console.log(`[QUERIES] ${queries.length} issued, MAX_RESULTS=${MAX_RESULTS}`)
  let dedupeUrls = new Set()
  let allResults = [],
    posted = 0,
    skipped = 0,
    fetched = 0
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
  let alertPayloads = []
  for (const result of allResults) {
    let html = "",
      summaryText = ""
    try {
      const res = await axios.get(result.url, { timeout: 8000 })
      html = res.data || ""
      let summary = typeof simplifyHtml === "function" ? await simplifyHtml(html) : ""
      if (typeof summary === "object" && summary !== null) summaryText = summary.text || JSON.stringify(summary)
      else summaryText = summary || ""
    } catch (e) {
      summaryText = "Summary unavailable."
    }
    try {
      await publishScreenshot(result.url)
      console.log(`[EVIDENCE] Screenshot for ${result.url}`)
    } catch (e) {
      console.log(`[EVIDENCE] Screenshot fail: ${e.message}`)
    }
    if (ALERTS_ENDPOINT) {
      const payload = {
        source: { channel: "discovery:web", url: result.url, publishedAt: result.publishedAt || new Date().toISOString() },
        issue: { summary: result.title || result.snippet || result.url || "", details: summaryText },
        location: { text: result.snippet || "" },
        evidence: { links: [result.url] },
        status: "PUBLIC_INTEREST_ALERT"
      }
      alertPayloads.push(payload)
      try {
        await axios.post(ALERTS_ENDPOINT, payload)
        posted++
        console.log(`[ALERT] POSTED: ${result.url}`)
      } catch (e) {
        console.log(`[ALERT] POST FAIL: ${e?.response?.status || e.message}`)
      }
    } else {
      console.log(`[ALERT] Skipped for ${result.url}, endpoint disabled`)
    }
    await new Promise(res => setTimeout(res, THROTTLE_MS))
  }
  console.log(`[REPORT] Queries issued: ${queries.length}, Results fetched: ${fetched}, Alerts posted: ${posted}, Duplicates skipped: ${skipped}.`)
  process.exit(0)
})()
