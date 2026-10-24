const { ToolRegistry } = require('../ToolRegistry');
const { createCreateStudentTool } = require('./createStudentTool');
const { createAssignStudentToClassroomTool } = require('./assignStudentToClassroomTool');

/**
 * The Step 8 onboarding tools in a create-only, locked registry.
 *
 * createOnboardingToken is deliberately NOT implemented: token policy
 * (generation, expiry, recipient, link) belongs with the email/verification
 * steps and must stay system-controlled. See tools/README.md.
 */
function createOnboardingToolRegistry(schema) {
  return new ToolRegistry({ allowedAccess: ['create'] })
    .register('createStudent', createCreateStudentTool(schema))
    .register('assignStudentToClassroom', createAssignStudentToClassroomTool(schema))
    .lock();
}

module.exports = { createOnboardingToolRegistry };
