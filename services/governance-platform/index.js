const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const logs = [];

app.post('/metrics', (req, res) => {
  logs.push({ type: 'metric', data: req.body, timestamp: new Date() });
  res.json({ status: 'logged' });
});

app.post('/provenance', (req, res) => {
  logs.push({ type: 'provenance', data: req.body, timestamp: new Date() });
  res.json({ status: 'logged' });
});

app.post('/ai_log', (req, res) => {
  logs.push({ type: 'ai_invocation', data: req.body, timestamp: new Date() });
  res.json({ status: 'logged' });
});

app.get('/reports', (req, res) => {
  res.json({ logs });
});

const port = process.env.PORT || 3005;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Governance Platform running on port ${port}`);
  });
}
module.exports = app;
