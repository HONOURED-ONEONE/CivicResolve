const axios = require("axios")

function printEnvSummary(envKeys) {
  console.log("Environment variables detected:")
  envKeys.forEach(k => console.log(`- ${k}`))
}

function parseCsv(str) {
  if (typeof str !== "string") return []
  return (str || "")
    .split(",")
    .map(x => (x || "").trim())
    .filter(Boolean)
}

;(async () => {
  const envKeys = ["CITY_NAME", "GEO_TERMS", "KEYWORDS", "MAX_RESULTS", "ALERTS_ENDPOINT"]
  printEnvSummary(envKeys)
  // Config and limits
  const CITY_NAME = process.env.CITY_NAME || ""
  const GEO_TERMS = parseCsv(process.env.GEO_TERMS)
  const KEYWORDS = parseCsv(process.env.KEYWORDS)
  const MAX_RESULTS = Math.max(1, Number(process.env.MAX_RESULTS) || 10)
  const ALERTS_ENDPOINT = process.env.ALERTS_ENDPOINT || ""
  const THROTTLE_MS = Math.max(500, Number(process.env.DISCOVERY_THROTTLE_MS) || 3000)

  // Compose compact set of queries
  let queries = []
  if (CITY_NAME) queries.push(CITY_NAME)
  queries.push(...GEO_TERMS)
  queries.push(...KEYWORDS.filter(q => !queries.includes(q)))
  queries = queries.filter(Boolean).slice(0, MAX_RESULTS)

  if (!queries.length) {
    console.error("No valid queries constructed from env.")
    process.exit(1)
  }
  console.log(`Discovery: queries issued = ${queries.length}, max results = ${MAX_RESULTS}.`)

  let dedupeUrls = new Set()
  let allResults = [],
    posted = 0,
    skipped = 0,
    fetched = 0
  for (const query of queries) {
    console.log(`Search: ${query}`)
    let search
    try {
      search = await searchWebWithTurboticAI(query, { maxResults: MAX_RESULTS })
      const validResults = Array.isArray(search?.usage?.results) ? search.usage.results : []
      if (!search.content || !validResults.length) {
        console.log(`[WARN] No content or valid results for query '${query}'.`)
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
      console.log(`Search error for query '${query}': ${e.message}`)
    }
    if (fetched >= MAX_RESULTS) break
  }

  allResults = allResults.filter(r => r && r.url).slice(0, MAX_RESULTS)
  let alertPayloads = []
  for (const result of allResults) {
    let html = "",
      summary = "",
      screenshotOk = false
    try {
      const res = await axios.get(result.url, { timeout: 8000 })
      html = res.data || ""
      summary = typeof simplifyHtml === "function" ? await simplifyHtml(html) : ""
      await publishScreenshot(Buffer.from(result.url).toString("base64"))
      screenshotOk = true
      console.log(`[EVIDENCE] Screenshot published for ${result.url}`)
    } catch (e) {
      summary = "Summary not available."
      console.log(`[EVIDENCE] Fetch failed for ${result.url}: ${e.message}`)
    }
    if (ALERTS_ENDPOINT) {
      const alertPayload = {
        source: {
          channel: "discovery:web",
          url: result.url,
          publishedAt: result.publishedAt || new Date().toISOString()
        },
        issue: {
          summary: result.title || result.url || "",
          details: summary || ""
        },
        location: { text: result.snippet || "" },
        evidence: { links: [result.url] },
        status: "PUBLIC_INTEREST_ALERT"
      }
      alertPayloads.push(alertPayload)
      try {
        await axios.post(ALERTS_ENDPOINT, alertPayload)
        posted++
        console.log(`[ALERT] POSTED: ${result.url}`)
      } catch (e) {
        console.log(`[ALERT] POST FAILED for ${result.url}: ${e?.response?.status || e.message}`)
      }
    } else {
      console.log(`[ALERT] Skipped, endpoint not configured`)
    }
    await new Promise(res => setTimeout(res, THROTTLE_MS))
  }
  console.log(`[REPORT] Run complete. Queries issued: ${queries.length}, Results fetched: ${fetched}, Alerts posted: ${posted}, Duplicates skipped: ${skipped}.`)
  process.exit(0)
})()
