const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

;(async () => {
  try {
    // --- 1. Parse incoming payload and context ---
    let payload = getContext("payload") // direct trigger context, queued/scheduled
    if (!payload) {
      throw new Error("No payload provided to sla_poller step - missing {ticket_id, dest, pack_pdf, reminder_s, deadline_s, first_seen_ts?}")
    }
    let { ticket_id, dest, pack_pdf, reminder_s, deadline_s, first_seen_ts, reminder_sent = false, status_check_fail_count = 0 } = payload

    // --- 2. Initialize first_seen_ts if missing ---
    if (!first_seen_ts) {
      first_seen_ts = Date.now()
    }

    const now = Date.now()
    // --- 3. Determine which status endpoint to poll ---
    let statusResp,
      statusObj = {},
      updated_at = now,
      pollError = null
    try {
      let statusUrl
      // Example: check for known dest endpoints (configurable)
      if (dest && dest.toLowerCase() === "swachhata") {
        // Replace with actual API if exists
        statusUrl = `https://swachh.city/api/ticket_status?ticket_id=${encodeURIComponent(ticket_id)}`
      } else {
        // Fallback to Sidecar simulate endpoint
        statusUrl = `${process.env.SIDECAR_BASE_URL}/simulate_ulb_status?ticket_id=${encodeURIComponent(ticket_id)}`
      }
      const httpResp = await axios.get(statusUrl, { timeout: 8000 })
      statusResp = httpResp.data || {}
      statusObj = statusResp
      updated_at = Date.now()
      status_check_fail_count = 0 // Reset fail counter if successful
    } catch (err) {
      pollError = err
      status_check_fail_count += 1
    }
    // Save status/state in step context for next poll run
    setContext("sla_poller_state", {
      ticket_id,
      dest,
      pack_pdf,
      reminder_s,
      deadline_s,
      first_seen_ts,
      reminder_sent,
      status_check_fail_count,
      last_status: statusObj,
      updated_at
    })

    // --- 4. DLQ alert for repeated poll failures ---
    if (status_check_fail_count >= 3) {
      await axios.post(process.env.NOTIFY_WEBHOOK, {
        type: "DLQ_ALERT",
        ticket_id,
        dest,
        fail_count: status_check_fail_count,
        pack_pdf,
        ts: now,
        message: "SLA Poller repeatedly failed to check ticket status - DLQ pattern."
      })
      console.log("DLQ alert sent after repeated status poll failures.")
      setContext("sla_poller_log", {
        ticket_id,
        dest,
        pack_pdf,
        reminder_s,
        deadline_s,
        first_seen_ts,
        last_status: statusObj,
        reminder_sent,
        polling_status: "dlq_sent",
        status_check_fail_count,
        now
      })
      return
    }
    // --- 5. SLA Reminder/Escalation logic ---
    const elapsed = Math.floor((now - Number(first_seen_ts)) / 1000) // in seconds
    let outcome_msg = null
    if (elapsed >= deadline_s) {
      // Deadline breach: escalate
      await axios.post(process.env.NOTIFY_WEBHOOK, {
        type: "ESCALATION",
        ticket_id,
        dest,
        pack_pdf,
        ts: now,
        elapsed,
        last_status: statusObj,
        message: `Ticket ${ticket_id} escalation: deadline breached [${deadline_s}s]`
      })
      outcome_msg = "ESCALATED"
    } else if (elapsed >= reminder_s && !reminder_sent) {
      // SLA reminder trigger
      await axios.post(process.env.NOTIFY_WEBHOOK, {
        type: "REMINDER",
        ticket_id,
        dest,
        pack_pdf,
        ts: now,
        elapsed,
        last_status: statusObj,
        message: `Ticket ${ticket_id} reminder: pending at ${elapsed}s [reminder at ${reminder_s}s]`
      })
      reminder_sent = true
      // Re-enqueue, aiming at deadline
      setContext("sla_poller_outcome", {
        next_run: now + (deadline_s - elapsed) * 1000,
        reason: "reminder_sent_wait_for_deadline"
      })
      outcome_msg = "REMINDER_SENT"
    } else {
      // Not yet time for escalation/reminder: re-enqueue with short poll interval
      setContext("sla_poller_outcome", {
        next_run: now + Math.min(300, deadline_s - elapsed) * 1000, // next 5m or rem time
        reason: "requeue_polling_patrol"
      })
      outcome_msg = "REQUEUED"
    }
    // --- 6. Outcome log ---
    setContext("sla_poller_log", {
      ticket_id,
      dest,
      elapsed,
      reminder_s,
      deadline_s,
      first_seen_ts,
      last_status: statusObj,
      updated_at,
      reminder_sent,
      outcome_msg,
      status_check_fail_count,
      poll_error: pollError ? pollError.toString() : undefined,
      pack_pdf,
      now
    })
    console.log(`sla_poller: Ticket ${ticket_id || "-"} | Elapsed ${elapsed}s | State: ${outcome_msg || "N/A"}`)
  } catch (e) {
    console.error("sla_poller error:", e)
    process.exit(1)
  }
})()
