function generateTraceId() {
  return require('crypto').randomUUID();
}

function handleFailOpen(fn, fallback) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error('Operation failed, falling back:', error.message);
      if (!res.headersSent) {
        res.json(fallback);
      }
    }
  };
}

const { JSONStore } = require('./persistence');

module.exports = {
  generateTraceId,
  handleFailOpen,
  JSONStore
};
