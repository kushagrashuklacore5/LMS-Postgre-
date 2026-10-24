const express = require('express');
const { StudentOnboardingAgent } = require('./agent/StudentOnboardingAgent');
const { createAgentRoutes } = require('./routes/agentRoutes');
const { ExcelImportService } = require('./import/ExcelImportService');
const { createImportRoutes } = require('./routes/importRoutes');
const { loadImportConfig } = require('./config');
const { ValidationError } = require('./errors');

const SERVICE_NAME = 'student-onboarding-agent';

function createApp({
  agent = new StudentOnboardingAgent(),
  importConfig = loadImportConfig(),
  importService = new ExcelImportService({ maxRows: importConfig.maxRows }),
} = {}) {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/agent', createAgentRoutes({ agent }));
  app.use('/import', createImportRoutes({ importService, maxFileBytes: importConfig.maxFileBytes }));

  app.use((req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}.` },
    });
  });

  // Error handler: structured JSON, never a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    // Errors raised by express.json() (malformed JSON, body too large, ...).
    if (err.type && err.status >= 400 && err.status < 500) {
      const known = {
        'entity.parse.failed': ['INVALID_JSON', 'Request body is not valid JSON.'],
        'entity.too.large': ['PAYLOAD_TOO_LARGE', 'Request body is too large.'],
      };
      const [code, message] = known[err.type] || ['BAD_REQUEST', err.message];
      return res.status(err.status).json({ error: { code, message } });
    }
    console.error(`[${SERVICE_NAME}] unhandled error on ${req.method} ${req.path}:`, err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  return app;
}

module.exports = { createApp };
