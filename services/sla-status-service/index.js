const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const ticketState = new Map();

app.post('/sla/init', async (req, res) => {
  const { ticket_id, dest } = req.body;
  ticketState.set(ticket_id, {
    status: 'FILED',
    updated_at: new Date().toISOString(),
    dest
  });
  res.json({ status: 'ok', ticket_id });
});

app.get('/sla/:ticket_id', async (req, res) => {
  const state = ticketState.get(req.params.ticket_id);
  if (!state) return res.status(404).json({ error: 'not found' });
  res.json(state);
});

// Adapted simulate_status logic from python
app.get('/status/simulate/:ticket_id', async (req, res) => {
  const { ticket_id } = req.params;
  const sequence = ["FILED", "IN_PROGRESS", "ACTION_TAKEN", "RESOLVED", "CLOSED"];
  
  if (!ticketState.has(ticket_id)) {
    ticketState.set(ticket_id, { status: 'FILED', updated_at: new Date() });
  }

  const entry = ticketState.get(ticket_id);
  const diffMinutes = (new Date() - new Date(entry.updated_at)) / 60000;

  if (diffMinutes >= 5.0) { // simulate progress every 5 min
    const idx = sequence.indexOf(entry.status);
    if (idx !== -1 && idx < sequence.length - 1) {
      entry.status = sequence[idx + 1];
      entry.updated_at = new Date();
    }
  }

  res.json({
    ticket_id,
    status: entry.status,
    updated_at: entry.updated_at
  });
});

const port = process.env.PORT || 3004;
app.listen(port, () => {
  console.log(`SLA Status Service running on port ${port}`);
});
