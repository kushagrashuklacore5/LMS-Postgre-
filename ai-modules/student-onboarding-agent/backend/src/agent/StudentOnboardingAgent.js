const { AgentContext } = require('./AgentContext');
const { LLMProvider } = require('../llm/LLMProvider');
const { ToolRegistry } = require('../tools/ToolRegistry');
const { ValidationError } = require('../errors');

/**
 * Orchestrates one onboarding operation: LLM reasoning + registered tools.
 *
 * Independent of Express, the LMS and any specific LLM vendor: the provider
 * and tools are injected. One instance can serve many runs concurrently, so
 * per-run state lives on the AgentContext, never on the agent.
 *
 * run() validates the context and reports truthfully what is configured; it
 * does not call the LLM or any tool.
 *
 * Tools (Step 8): the agent knows WHICH tools exist, what they do and what
 * arguments they accept (describe() -> plain data from the registry). It
 * cannot execute tools directly or reach the LMS adapter. Execution goes
 * only through runApprovedImport(jobId):
 *   agent -> ApprovedImportExecutor (approved job from the store) -> ToolExecutor
 *   (lookup, create-only access, argument validation) -> tool -> LMS adapter facade
 * The LLM is not given tool-calling; no provider output can reach this path.
 */
class StudentOnboardingAgent {
  constructor({ llmProvider = null, toolRegistry = new ToolRegistry(), importExecutor = null } = {}) {
    if (llmProvider !== null) {
      LLMProvider.assertValid(llmProvider);
    }
    if (!(toolRegistry instanceof ToolRegistry)) {
      throw new TypeError('toolRegistry must be a ToolRegistry instance.');
    }
    if (importExecutor !== null && typeof importExecutor.executeApprovedImport !== 'function') {
      throw new TypeError('importExecutor must provide executeApprovedImport(jobId).');
    }
    this.llmProvider = llmProvider;
    this.toolRegistry = toolRegistry;
    // Private: only runApprovedImport() uses it; describe() never exposes it.
    Object.defineProperty(this, 'importExecutor', { value: importExecutor, enumerable: false });
  }

  /** Executes an approved import (jobId only). The agent adds no data, state or approval of its own. */
  async runApprovedImport(jobId) {
    if (!this.importExecutor) {
      throw new ValidationError('No approved-import executor is configured.', [], { code: 'EXECUTOR_NOT_CONFIGURED', statusCode: 503 });
    }
    return this.importExecutor.executeApprovedImport(jobId);
  }

  describe() {
    return {
      llm: {
        configured: this.llmProvider !== null,
        provider: this.llmProvider ? this.llmProvider.name : null,
      },
      tools: this.toolRegistry.list(),
    };
  }

  async run(context) {
    if (!(context instanceof AgentContext)) {
      throw new TypeError('run() expects an AgentContext; build one with AgentContext.fromRequest().');
    }

    const startedAt = new Date().toISOString();
    context.status = 'validated';

    // Orchestration steps (LLM column mapping, validation, create-only tools,
    // email, progress) are added in later steps. Until then, report honestly.
    const { llm, tools } = this.describe();
    context.status = llm.configured ? 'orchestration_not_implemented' : 'provider_not_configured';

    return {
      requestId: context.requestId,
      status: context.status,
      message: llm.configured
        ? `LLM provider "${llm.provider}" is configured, but no orchestration steps are implemented yet. The provider was not called.`
        : 'The orchestration layer is ready, but no LLM provider is configured. No LLM was called and no records were created.',
      llm: { ...llm, called: false },
      tools: { registered: tools, invoked: [] },
      input: {
        source: context.source,
        studentsReceived: context.students.length,
      },
      validation: context.validation,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

module.exports = { StudentOnboardingAgent };
