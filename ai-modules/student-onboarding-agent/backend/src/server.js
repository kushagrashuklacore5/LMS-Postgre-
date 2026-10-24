const path = require('path');

// Load this module's own .env only (never the LMS .env), regardless of cwd.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const { createApp } = require('./app');

const DEFAULT_PORT = 5055;
const port = Number(process.env.SOA_PORT) || DEFAULT_PORT;

const app = createApp();

app.listen(port, () => {
  console.log(`[student-onboarding-agent] backend running at http://localhost:${port}`);
});
