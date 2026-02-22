const axios = require("axios")

function printEnvSummary(envKeys) {
  console.log("Environment variables detected:")
  envKeys.forEach(k => console.log(`- ${k}`))
}

function parseCsv(str) {
  return (str || "")
    .split(",")
    .map(x => x.trim())
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
  const ALERTS_ENDPOINT = process.env.ALERTS_ENDPOINT

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
      if (!search.content || !Array.isArray(search.usage?.results)) continue
      for (const result of search.usage.results) {
        if (!result.url || dedupeUrls.has(result.url)) {
          skipped++
          continue
        }
        dedupeUrls.add(result.url)
        allResults.push(result)
        fetched++
      }
    } catch (e) {
      console.log(`Search error for query '${query}': ${e.message}`)
    }
    if (fetched >= MAX_RESULTS) break
  }

  allResults = allResults.slice(0, MAX_RESULTS)
  for (const result of allResults) {
    let html = "",
      summary = "",
      screenshotOk = false
    try {
      const res = await axios.get(result.url, { timeout: 8000 })
      html = res.data
      summary = await simplifyHtml(html)
      screenshotOk = true
      await publishScreenshot(Buffer.from("Evidence__" + result.url).toString("base64"))
    } catch (e) {
      summary = "Summary not available."
      console.log(`Evidence fetch failed for ${result.url}: ${e.message}`)
      screenshotOk = false
    }
    if (ALERTS_ENDPOINT) {
      const alertPayload = {
        source: {
          channel: "discovery:web",
          url: result.url,
          publishedAt: result.publishedAt || new Date().toISOString()
        },
        issue: {
          summary: result.title || result.url,
          details: summary || ""
        },
        location: { text: result.snippet || "" },
        evidence: { links: [result.url] },
        status: "PUBLIC_INTEREST_ALERT"
      }
      try {
        await axios.post(ALERTS_ENDPOINT, alertPayload)
        posted++
        console.log(`Alert POSTED: ${result.url}`)
      } catch (e) {
        console.log(`Alert POST failed for ${result.url}: ${e?.response?.status || e.message}`)
      }
    } else {
      console.log("alerts disabled")
    }
    await new Promise(res => setTimeout(res, 3000))
  }
  console.log(`Run complete. Queries issued: ${queries.length}, Results fetched: ${fetched}, Alerts posted: ${posted}, Duplicates skipped: ${skipped}.`)
  process.exit(0)
})()
