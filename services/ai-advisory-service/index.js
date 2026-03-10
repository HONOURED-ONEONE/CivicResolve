const express = require('express');
const { handleFailOpen } = require('@civicresolve/shared-utils');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/vision_extract', handleFailOpen(async (req, res) => {
  const mockExtract = {
    summary: "Extracted issue summary from vision",
    category: "Sanitation",
    confidence: 0.8,
    derived: true
  };
  res.json(mockExtract);
}, { summary: "unknown", category: "unknown", confidence: 0, derived: true }));

app.post('/draft_assist', handleFailOpen(async (req, res) => {
  const mepp = req.body.mepp;
  const draft = `Draft response for issue: ${mepp?.issue?.summary || 'unknown issue'}. Please review and update.`;
  res.json({ draft, derived: true });
}, { draft: "", derived: true }));

app.post('/search_citations', handleFailOpen(async (req, res) => {
  res.json([{ title: "Citation 1", url: "http://example.com", snippet: "Snippet" }]);
}, []));

const port = process.env.PORT || 3002;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`AI Advisory running on port ${port}`);
  });
}
module.exports = app;
