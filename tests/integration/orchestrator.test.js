const assert = require('assert');
const http = require('http');

async function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log("Running integration tests...\n");

  const baseUrl = 'http://localhost:3001';

  // Test 1: Orchestrator Happy Path
  console.log("Test 1: Orchestrator Happy Path");
  try {
    const res = await request(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      ticket_id: "TEST-001",
      issue: { summary: "Pothole on Main St", category: "Roads", details: "Deep pothole" },
      location: { lat: 11.1, lon: 77.3, address: "Main St", ward: "14" },
      evidence: { photos: ["http://img1.com", "http://img2.com"] },
      source: { channel: "app", confidence: 0.8 }
    });
    
    assert.strictEqual(res.status, 200, "Should return 200");
    assert.strictEqual(res.data.status, "action", "Should have 'action' gate status");
    assert.ok(res.data.ticket_id, "Should return a filed ticket_id");
    assert.ok(res.data.route, "Should return route info");
    assert.ok(res.data.pack, "Should return pack info");
    console.log("✅ Passed");
  } catch (err) {
    console.error("❌ Failed", err);
  }

  // Test 2: AI Fail-Open Path (Needs Info)
  console.log("\nTest 2: AI Fail-Open Path (Needs Info)");
  try {
    const res = await request(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      ticket_id: "TEST-002",
      issue: { summary: "Garbage", category: "Sanitation" },
      location: { ward: "12" },
      evidence: { links: ["http://some-link.com"] },
      source: { confidence: 0.8 }
    });
    
    assert.strictEqual(res.status, 200, "Should return 200");
    assert.strictEqual(res.data.status, "needs_info", "Should have 'needs_info' status");
    // Verify AI draft assist was called and marked as derived
    if (res.data.mepp.issue.draft_assistance) {
       assert.strictEqual(res.data.mepp.issue.draft_derived, true, "AI draft should be derived=true");
    }
    console.log("✅ Passed");
  } catch (err) {
    console.error("❌ Failed", err);
  }
  
  // Test 3: Connector Stub Path
  console.log("\nTest 3: Connector Stub Path");
  try {
    const res = await request(`http://localhost:3003/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      mepp: { case_id: "TEST-CONN" },
      route: { dest: "TN_CM_HELPLINE" },
      pack: { pdf_url: "http://pdf" }
    });
    
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.ticket_id.startsWith('TN-'), "Should prefix ticket with TN- for TN_CM_HELPLINE");
    console.log("✅ Passed");
  } catch (err) {
    console.error("❌ Failed", err);
  }

  // Test 4: SLA Reminder/Escalation Simulation Path
  console.log("\nTest 4: SLA Reminder/Escalation Simulation Path");
  try {
    const ticketId = "TEST-SLA-01";
    // Init SLA
    await request(`http://localhost:3004/sla/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { ticket_id: ticketId, dest: "ULB" });

    // Poll to simulate progress
    const res = await request(`http://localhost:3004/status/simulate/${ticketId}`, { method: 'GET' });
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "FILED", "Should start at FILED");
    
    console.log("✅ Passed");
  } catch (err) {
    console.error("❌ Failed", err);
  }
}

// We just print instructions since actual services might not be up in this basic script check without docker.
console.log("Tests prepared. Run these while the services are up.");
runTests();
