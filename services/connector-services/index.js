const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/file', async (req, res) => {
  const { mepp, route, pack } = req.body;
  
  // Basic mock connector
  const prefix = route?.dest?.includes('TN') ? 'TN-' : 
                 route?.dest?.includes('CPGRAMS') ? 'CP-' : 'SW-';
                 
  const ticket_id = `${prefix}${Date.now()}`;
  
  res.json({
    status: "filed",
    ticket_id,
    connector: route?.dest || "generic",
    pack_pdf: pack?.pdf_url
  });
});

const port = process.env.PORT || 3003;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Connector Services running on port ${port}`);
  });
}
module.exports = app;
