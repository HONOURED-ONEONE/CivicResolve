const express = require('express');
const { JSONStore } = require('@civicresolve/shared-utils');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const store = new JSONStore('governance_logs');

app.post('/metrics', (req, res) => {
  store.push('logs', { type: 'metric', data: req.body, timestamp: new Date().toISOString() });
  res.json({ status: 'logged' });
});

app.post('/provenance', (req, res) => {
  store.push('logs', { type: 'provenance', data: req.body, timestamp: new Date().toISOString() });
  res.json({ status: 'logged' });
});

app.post('/ai_log', (req, res) => {
  store.push('logs', { type: 'ai_invocation', data: req.body, timestamp: new Date().toISOString() });
  res.json({ status: 'logged' });
});

app.get('/reports', (req, res) => {
  res.json({ logs: store.getList('logs') });
});

const port = process.env.PORT || 3005;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Governance Platform running on port ${port}`);
  });
}
module.exports = app;
