const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const axios = require('axios');

// Apps
const orchestratorApp = require('../../services/case-orchestrator-service/index');
const connectorApp = require('../../services/connector-services/index');
const slaApp = require('../../services/sla-status-service/index');

describe('Integration Tests (Mocked Services)', () => {
  let originalPost;
  let mockState = {};

  before(() => {
    originalPost = axios.post;
    axios.post = async (url, data, config) => {
      // Mock Intelligence
      if (url.includes('/dedupe')) return { data: { similarity: 0.1 } };
      if (url.includes('/cluster')) return { data: mockState.clusterResponse || { cluster_id: 'CL-001' } };
      if (url.includes('/score')) return { data: { score: 0.9 } };
      if (url.includes('/route')) return { data: mockState.routeResponse || { dest: 'TN_CM_HELPLINE' } };
      if (url.includes('/pack')) return { data: { pdf_url: 'http://mock-pack.pdf', pack_id: 'PK-123' } };

      // Mock AI Advisory
      if (url.includes('/draft_assist')) {
        if (mockState.draftAssistThrows) {
          throw new Error('AI Service Down');
        }
        return { data: { draft: 'Mocked draft response' } };
      }

      // Mock Connector
      if (url.includes('/file')) return { data: { status: 'filed', ticket_id: 'TN-1234' } };

      // Mock SLA
      if (url.includes('/sla/init')) return { data: { status: 'ok' } };

      // Mock Governance
      if (url.includes('/metrics')) return { data: { status: 'logged' } };

      throw new Error(`Unhandled mock for URL: ${url}`);
    };
  });

  after(() => {
    axios.post = originalPost;
  });

  test('Test 1: Orchestrator Happy Path', async () => {
    mockState = {};
    const res = await request(orchestratorApp)
      .post('/ingest')
      .send({
        ticket_id: "TEST-001",
        issue: { summary: "Pothole on Main St", category: "Roads", details: "Deep pothole" },
        location: { lat: 11.1, lon: 77.3, address: "Main St", ward: "14" },
        evidence: { photos: ["http://img1.com", "http://img2.com"] },
        source: { channel: "app", confidence: 0.8 }
      });
      
    assert.strictEqual(res.status, 200, "Should return 200");
    assert.strictEqual(res.body.status, "action", "Should have 'action' gate status");
    assert.ok(res.body.ticket_id, "Should return a filed ticket_id");
    assert.ok(res.body.route, "Should return route info");
    assert.ok(res.body.pack, "Should return pack info");
  });

  test('Test 2: AI Fail-Open Path (Needs Info) - Happy AI', async () => {
    mockState = {};
    const res = await request(orchestratorApp)
      .post('/ingest')
      .send({
        ticket_id: "TEST-002",
        issue: { summary: "Garbage", category: "Sanitation" },
        location: { ward: "12" },
        evidence: { links: ["http://some-link.com"] },
        source: { confidence: 0.8 }
      });
      
    assert.strictEqual(res.status, 200, "Should return 200");
    assert.strictEqual(res.body.status, "needs_info", "Should have 'needs_info' status");
    if (res.body.mepp && res.body.mepp.issue.draft_assistance) {
       assert.strictEqual(res.body.mepp.issue.draft_derived, true, "AI draft should be derived=true");
    }
  });

  test('Test 3: Connector Stub Path', async () => {
    mockState = {};
    const res = await request(connectorApp)
      .post('/file')
      .send({
        mepp: { case_id: "TEST-CONN" },
        route: { dest: "TN_CM_HELPLINE" },
        pack: { pdf_url: "http://pdf" }
      });
      
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.ticket_id.startsWith('TN-'), "Should prefix ticket with TN- for TN_CM_HELPLINE");
  });

  test('Test 4: SLA Reminder/Escalation Simulation Path', async () => {
    mockState = {};
    const ticketId = "TEST-SLA-01";
    // Init SLA
    await request(slaApp)
      .post('/sla/init')
      .send({ ticket_id: ticketId, dest: "ULB" });

    // Poll to simulate progress
    const res = await request(slaApp).get(`/status/simulate/${ticketId}`);
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "FILED", "Should start at FILED");
  });

  test('Test 5: Downstream Contract Mismatch Behavior', async () => {
    // Missing 'dest' in route response
    mockState = { routeResponse: { unexpected_key: 'value' } };
    
    const res = await request(orchestratorApp)
      .post('/ingest')
      .send({
        ticket_id: "TEST-005",
        issue: { summary: "Pothole", category: "Roads", details: "Deep" },
        location: { lat: 11.1, lon: 77.3, address: "Main", ward: "14" },
        evidence: { photos: ["http://img1.com", "http://img2.com"] },
        source: { channel: "app", confidence: 0.8 }
      });
      
    assert.strictEqual(res.status, 502, "Should return 502 Bad Gateway");
    assert.ok(res.body.error.includes("intelligence service"), "Should indicate intelligence service error");
  });

  test('Test 6: AI Fail-Open Timeout/Error Behavior', async () => {
    mockState = { draftAssistThrows: true }; // Make AI throw an error
    
    const res = await request(orchestratorApp)
      .post('/ingest')
      .send({
        ticket_id: "TEST-006",
        issue: { summary: "Garbage", category: "Sanitation" },
        location: { ward: "12" },
        evidence: { links: ["http://some-link.com"] },
        source: { confidence: 0.8 }
      });
      
    assert.strictEqual(res.status, 200, "Should still return 200 despite AI error");
    assert.strictEqual(res.body.status, "needs_info", "Should be needs_info");
    assert.strictEqual(res.body.mepp.issue.draft_assistance, undefined, "Should not have draft assistance");
    assert.strictEqual(res.body.mepp.issue.draft_derived, undefined, "Should not have derived flag");
  });
});
