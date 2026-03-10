const app = require('./app');

const port = process.env.PORT || 3003;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Connector Services running on port ${port}`);
  });
}

module.exports = app;
