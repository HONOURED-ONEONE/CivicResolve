const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'development';
const testDir = path.join(__dirname, '..', '.test_data');
process.env.STORAGE_DIR = testDir;

const app = require('../../services/connector-services/app');

describe('Connector Services Adapter Framework', () => {
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

  test('should handle CPGRAMS routing', async () => {
    const res = await request(app)
      .post('/file')
      .send({
        mepp: { case_id: 'CASE-123' },
        route: { dest: 'CPGRAMS' },
        pack: { pdf_url: 'http://test.pdf' }
      });
    
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.connector, 'CPGRAMS');
    assert.ok(res.body.ticket_id.startsWith('CP-'));
    assert.strictEqual(res.body.pack_pdf, 'http://test.pdf');
  });

  test('should handle Swachhata routing', async () => {
    const res = await request(app)
      .post('/file')
      .send({
        mepp: { case_id: 'CASE-124' },
        route: { dest: 'SWACHHATA' },
        pack: { pdf_url: 'http://test.pdf' }
      });
    
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.connector, 'SWACHHATA');
    assert.ok(res.body.ticket_id.startsWith('SW-'));
  });

  test('should handle TN CM Helpline routing (partial match)', async () => {
    const res = await request(app)
      .post('/file')
      .send({
        mepp: { case_id: 'CASE-125' },
        route: { dest: 'TN_CM_HELPLINE' }
      });
    
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.connector, 'TN_CM_HELPLINE');
    assert.ok(res.body.ticket_id.startsWith('TN-'));
  });

  test('should fall back to Generic adapter for unknown dest', async () => {
    const res = await request(app)
      .post('/file')
      .send({
        mepp: { case_id: 'CASE-126' },
        route: { dest: 'UNKNOWN_SYSTEM' }
      });
    
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.connector, 'generic');
    assert.ok(res.body.ticket_id.startsWith('GEN-'));
  });

  test('should handle idempotency for repeated filings', async () => {
    const payload = {
      mepp: { case_id: 'CASE-IDEM' },
      route: { dest: 'TN' },
      idempotency_key: 'idempotent-key-1'
    };

    const res1 = await request(app).post('/file').send(payload);
    assert.strictEqual(res1.statusCode, 200);
    const ticketId1 = res1.body.ticket_id;

    // Second request with exact same payload and idempotency key
    const res2 = await request(app).post('/file').send(payload);
    assert.strictEqual(res2.statusCode, 200);
    const ticketId2 = res2.body.ticket_id;

    assert.strictEqual(ticketId1, ticketId2, 'Should return the exact same ticket ID from idempotency cache');
  });

  test('should retrieve durable receipt', async () => {
    const res1 = await request(app)
      .post('/file')
      .send({
        mepp: { case_id: 'CASE-RCPT' },
        route: { dest: 'CPGRAMS' }
      });
    assert.strictEqual(res1.statusCode, 200);
    const ticketId = res1.body.ticket_id;

    const res2 = await request(app).get(`/receipts/${ticketId}`);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.ticket_id, ticketId);
    assert.strictEqual(res2.body.connector, 'CPGRAMS');
  });
});
