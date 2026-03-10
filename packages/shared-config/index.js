const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  INTELLIGENCE_SERVICE_URL: process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8000',
  AI_ADVISORY_SERVICE_URL: process.env.AI_ADVISORY_SERVICE_URL || 'http://localhost:3002',
  CONNECTOR_SERVICE_URL: process.env.CONNECTOR_SERVICE_URL || 'http://localhost:3003',
  SLA_STATUS_SERVICE_URL: process.env.SLA_STATUS_SERVICE_URL || 'http://localhost:3004',
  GOVERNANCE_PLATFORM_URL: process.env.GOVERNANCE_PLATFORM_URL || 'http://localhost:3005',
  
  ENABLE_AI_ADVISORY: process.env.ENABLE_AI_ADVISORY === 'true',
  ENABLE_VISION_EXTRACT: process.env.ENABLE_VISION_EXTRACT === 'true',
  ENABLE_DRAFT_ASSIST: process.env.ENABLE_DRAFT_ASSIST === 'true',
  ENABLE_SEARCH_CITATIONS: process.env.ENABLE_SEARCH_CITATIONS === 'true',

  SEARCH_PROVIDER: process.env.SEARCH_PROVIDER || 'stub',
  VISION_PROVIDER: process.env.VISION_PROVIDER || 'stub',
  REASONING_PROVIDER: process.env.REASONING_PROVIDER || 'stub',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ''
};
