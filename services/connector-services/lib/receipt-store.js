const { JSONStore } = require('@civicresolve/shared-utils');
const { RECEIPT_SCHEMA } = require('@civicresolve/contracts');

class ReceiptStore {
  constructor() {
    this.store = new JSONStore('connector_receipts');
  }

  save(receipt) {
    if (!receipt.ticket_id) {
      throw new Error('Receipt must have a ticket_id');
    }

    // Validate against canonical contract
    for (const field of RECEIPT_SCHEMA.required || []) {
      if (!receipt[field]) {
        throw new Error(`Invalid Receipt: Missing required field '${field}'`);
      }
    }

    this.store.set(receipt.ticket_id, receipt);
    return receipt;
  }

  get(ticketId) {
    return this.store.get(ticketId);
  }
}

module.exports = new ReceiptStore();
