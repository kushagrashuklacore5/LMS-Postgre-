const express = require('express');
const { AgentContext } = require('../agent/AgentContext');

/**
 * HTTP adapter for the agent. Knows about Express; the agent does not.
 */
function createAgentRoutes({ agent }) {
  const router = express.Router();

  // POST /agent/run — validate the body, build a context, run the agent.
  // Validation errors are thrown and turned into 400s by the app's error handler.
  router.post('/run', async (req, res) => {
    const context = AgentContext.fromRequest(req.body);
    const result = await agent.run(context);
    res.json(result);
  });

  return router;
}

module.exports = { createAgentRoutes };
