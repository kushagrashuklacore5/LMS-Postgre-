const path = require("path");
const express = require("express");
const {
  createLmsAssessmentAgentRouter,
  assessmentErrorHandler,
  createQuestionImageStore,
} = require("../../ai-modules/ai-assessment-agent/backend/src/integration/lmsAssessmentAgent");
const { onAssessmentAgentEvent } = require("../services/assessmentAgentNotifications");

/**
 * AI Assessment Agent (teacher-authored MCQ assessments, Step 1).
 * Mounted in server.js at /api/assessment-agent behind authMiddleware + requireTenant.
 * The router re-checks the user against the DB (teacher = mentor/teacher, student = student,
 * same school) and scopes everything to the session's school and teacher.
 * Unrelated to the legacy course assessments at /api/assessments.
 * All logic lives in ai-modules/ai-assessment-agent. To remove the feature, see its README.
 */
const { moduleDatabase: database } = require("../helpers/dbAsync");

// One private store for question pictures, shared with the course assessments (routes/assessmentRoutes.js)
const questionImageStore = createQuestionImageStore();

module.exports = {
  questionImageStore,
  // onEvent: published tests/assignments, submissions, final marks and shared reports become notifications
  router: createLmsAssessmentAgentRouter({ express, database, onEvent: onAssessmentAgentEvent, imageStore: questionImageStore }),
  errorHandler: assessmentErrorHandler,
};
