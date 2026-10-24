const { secretProblem } = require('./jwt');

/**
 * Startup configuration checks and the CORS allow-list.
 *
 * The server refuses to start when it could not authenticate anyone safely.
 * Production has extra requirements, because there a silent insecure default
 * (a template secret, an open CORS policy, demo accounts) exposes real schools.
 */

const isProduction = () => process.env.NODE_ENV === 'production';

const LOCAL_DEV_ORIGINS = [5173, 5174, 5175, 5176, 5177, 5178].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

const listFromEnv = (name) =>
  (process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

/** Origins allowed to call the API from a browser. Never a wildcard. */
function getAllowedOrigins() {
  const configured = [...listFromEnv('CORS_ORIGINS'), ...listFromEnv('FRONTEND_ORIGIN')];
  const origins = isProduction() ? configured : [...LOCAL_DEV_ORIGINS, ...configured];
  return Array.from(new Set(origins));
}

/** Returns a list of human-readable problems; empty when the configuration is safe to run. */
function findConfigProblems() {
  const problems = [];

  const jwtProblem = secretProblem(process.env.JWT_SECRET, 'JWT_SECRET');
  if (jwtProblem) problems.push(jwtProblem);

  if (isProduction()) {
    const refreshProblem = secretProblem(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
    if (refreshProblem) problems.push(refreshProblem);
    if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET === process.env.JWT_SECRET) {
      problems.push('JWT_REFRESH_SECRET must be different from JWT_SECRET');
    }

    const origins = getAllowedOrigins();
    if (origins.length === 0) {
      problems.push('CORS_ORIGINS (or FRONTEND_ORIGIN) must list the web app origin(s)');
    }
    if (origins.includes('*')) {
      problems.push('CORS_ORIGINS must not contain "*"');
    }

    if (process.env.SEED_DEMO_DATA === 'true') {
      problems.push('SEED_DEMO_DATA must not be enabled in production');
    }
  }

  return problems;
}

/** Stops the process with a clear message when the configuration is unsafe. */
function assertSecureStartup() {
  const problems = findConfigProblems();
  if (problems.length === 0) return;

  console.error('❌ The server cannot start with the current configuration:');
  problems.forEach((problem) => console.error(`   - ${problem}`));
  console.error('   See server/.env.example for the required settings.');
  process.exit(1);
}

module.exports = { assertSecureStartup, findConfigProblems, getAllowedOrigins, isProduction };
