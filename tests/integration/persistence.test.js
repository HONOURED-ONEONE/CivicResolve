const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'development';
const testDir = path.join(__dirname, '..', '.test_data');
process.env.STORAGE_DIR = testDir;

const { JSONStore } = require('../../packages/shared-utils/persistence');

describe('Persistence Tests', () => {
  before(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should persist SLA status across re-instantiation', async () => {
    const app = require('../../services/sla-status-service/index');
    
    const res = await request(app)
      .post('/sla/init')
      .send({ ticket_id: 'SLA-TEST-1', dest: 'TN' });
    
    assert.strictEqual(res.statusCode, 200);
    
    const newStore = new JSONStore('sla_ticket_state');
    const state = newStore.get('SLA-TEST-1');
    assert.ok(state);
    assert.strictEqual(state.status, 'FILED');
    assert.strictEqual(state.dest, 'TN');
  });

  test('should persist governance logs across re-instantiation', async () => {
    const app = require('../../services/governance-platform/index');
    
    const res = await request(app)
      .post('/metrics')
      .send({ user: 'tester', value: 42 });
    
    assert.strictEqual(res.statusCode, 200);

    const res2 = await request(app).get('/reports');
    assert.strictEqual(res2.statusCode, 200);
    assert.ok(res2.body.logs.length > 0);
    assert.strictEqual(res2.body.logs[res2.body.logs.length - 1].data.value, 42);

    const newStore = new JSONStore('governance_logs');
    const logs = newStore.getList('logs');
    assert.ok(logs.length > 0);
    assert.strictEqual(logs[logs.length - 1].data.value, 42);
  });

  test('should persist connector receipts across re-instantiation', async () => {
    const app = require('../../services/connector-services/index');
    
    const res = await request(app)
      .post('/file')
      .send({ route: { dest: 'TN-TEST' }, pack: { pdf_url: 'test.pdf' } });
    
    assert.strictEqual(res.statusCode, 200);
    const ticketId = res.body.ticket_id;
    assert.ok(ticketId);

    const res2 = await request(app).get(`/receipts/${ticketId}`);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.pack_pdf, 'test.pdf');

    const newStore = new JSONStore('connector_receipts');
    const receipt = newStore.get(ticketId);
    assert.ok(receipt);
    assert.strictEqual(receipt.pack_pdf, 'test.pdf');
  });
});
