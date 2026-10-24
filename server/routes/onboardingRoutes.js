const path = require("path");
const express = require("express");
const bcrypt = require("../helpers/passwords");
const rateLimit = require("express-rate-limit");
const {
  createLmsOnboardingRouter,
  createStudentSetupRouter,
  onboardingErrorHandler,
} = require("../../ai-modules/student-onboarding-agent/backend/src/integration/lmsOnboarding");
const { createStudentSetupService } = require("../../ai-modules/student-onboarding-agent/backend/src/onboarding/StudentSetupService");
const { createOnboardingEmailAdapter } = require("../services/onboardingEmailAdapter");

/**
 * Student Onboarding Agent (bulk Excel student import) + Step 11 password setup.
 * Mounted in server.js:
 *   /api/onboarding     behind authMiddleware + requireTenant; the router itself enforces
 *                       admin-only, re-checks the admin against the DB, and keeps each
 *                       school's import jobs private.
 *   /api/student-setup  public, rate-limited: a student sets their own password with the
 *                       one-time link emailed after the import.
 * errorHandler is mounted after both so upstream errors on these paths (e.g. malformed
 * JSON rejected by the global body parser) get safe JSON responses.
 * All logic lives in ai-modules/student-onboarding-agent.
 */
const { moduleDatabase: sql } = require("../helpers/dbAsync");

const setupService = createStudentSetupService({
  sql,
  hashPassword: (plain) => bcrypt.hash(plain, 10), // same hashing as registration/login
  emailAdapter: createOnboardingEmailAdapter(),
  setupUrl: process.env.STUDENT_SETUP_URL, // e.g. https://<client-host>/setup-password
});

// Setup-password emails are PAUSED unless ONBOARDING_EMAIL_ENABLED=true. While paused, imports send
// nothing and each created student reports email "skipped"; /api/student-setup stays mounted for later.
const emailEnabled = process.env.ONBOARDING_EMAIL_ENABLED === "true";

// TEMPORARY testing/admin mechanism: while email is paused, a school admin can set the first password
// of a student their import created (POST /api/onboarding/imports/:jobId/rows/:rowNumber/password).
// Same bcryptjs hashing as login. Turns off automatically when email is enabled; remove once the
// production invite flow is live.
const hashPassword = (plain) => bcrypt.hash(plain, 10);
const tempPasswordSetupEnabled = !emailEnabled;

module.exports = {
  emailEnabled,
  tempPasswordSetupEnabled,
  router: createLmsOnboardingRouter({
    express,
    sql,
    setupService: emailEnabled ? setupService : null,
    skipSetupEmails: !emailEnabled,
    tempPasswordSetup: tempPasswordSetupEnabled ? { hashPassword } : null,
  }),
  setupRouter: createStudentSetupRouter({ express, setupService }),
  setupRateLimit: rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } }),
  }),
  errorHandler: onboardingErrorHandler,
};
