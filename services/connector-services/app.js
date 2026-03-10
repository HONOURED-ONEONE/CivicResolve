const express = require('express');
const { normalizeRequest } = require('./lib/request-normalizer');
const { normalizeResponse } = require('./lib/response-normalizer');
const idempotencyManager = require('./lib/idempotency');
const receiptStore = require('./lib/receipt-store');
const adapterRegistry = require('./lib/adapter-registry');
const retryPolicy = require('./lib/retry-policy');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/file', async (req, res) => {
  try {
    // 1. Normalize request
    const request = normalizeRequest(req.body);

    // 2. Check Idempotency
    const existingResult = idempotencyManager.get(request.idempotency_key);
    if (existingResult) {
      return res.json(existingResult); // Return existing receipt if already filed
    }

    // 3. Get adapter for destination
    const adapter = adapterRegistry.getAdapter(request.destination);

    // 4. File with Retry Policy
    const rawAdapterResponse = await retryPolicy.execute(() => adapter.file(request));

    // 5. Normalize Response
    const response = normalizeResponse(rawAdapterResponse);

    // 6. Create Receipt
    const receipt = {
      ticket_id: response.ticket_id,
      case_id: request.case_id,
      connector: response.connector,
      status: response.status,
      filed_at: new Date().toISOString(),
      pack_pdf: response.pack_pdf,
      metadata: response.metadata
    };

    // 7. Save Receipt and mark Idempotency
    receiptStore.save(receipt);
    idempotencyManager.set(request.idempotency_key, response);

    // Orchestrator contract requires status, ticket_id, connector, pack_pdf
    res.json(response);

  } catch (error) {
    console.error("Filing error:", error);
    res.status(500).json({
      status: "error",
      error: error.message || "Internal Server Error"
    });
  }
});

app.get('/receipts/:ticket_id', (req, res) => {
  const receipt = receiptStore.get(req.params.ticket_id);
  if (!receipt) return res.status(404).json({ error: 'not found' });
  res.json(receipt);
});

module.exports = app;
