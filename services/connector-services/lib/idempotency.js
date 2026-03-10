const { JSONStore } = require('@civicresolve/shared-utils');

class IdempotencyManager {
  constructor() {
    this.store = new JSONStore('connector_idempotency');
  }

  // Check if an idempotency key already has a result
  get(key) {
    if (!key) return null;
    return this.store.get(key);
  }

  // Save the result for an idempotency key
  set(key, result) {
    if (!key) return;
    this.store.set(key, result);
  }
}

module.exports = new IdempotencyManager();
