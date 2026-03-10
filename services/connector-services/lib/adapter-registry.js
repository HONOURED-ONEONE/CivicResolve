const cpgramsAdapter = require('../adapters/cpgrams');
const swachhataAdapter = require('../adapters/swachhata');
const tncmAdapter = require('../adapters/tncm');
const genericAdapter = require('../adapters/generic');

class AdapterRegistry {
  constructor() {
    this.adapters = {
      'CPGRAMS': cpgramsAdapter,
      'SWACHHATA': swachhataAdapter,
      'TN_CM_HELPLINE': tncmAdapter,
      'TN': tncmAdapter, // Alias from tests
      'GENERIC': genericAdapter
    };
  }

  getAdapter(destination) {
    if (!destination) return genericAdapter;
    
    // Normalize destination to uppercase and find adapter
    const normalizedDest = destination.toUpperCase();
    
    // Exact match
    if (this.adapters[normalizedDest]) {
      return this.adapters[normalizedDest];
    }
    
    // Partial match (e.g. TN-TEST -> TN)
    for (const key of Object.keys(this.adapters)) {
      if (normalizedDest.includes(key)) {
        return this.adapters[key];
      }
    }
    
    return genericAdapter;
  }
}

module.exports = new AdapterRegistry();
