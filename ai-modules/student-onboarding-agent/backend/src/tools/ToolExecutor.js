const { ValidationError } = require('../errors');
const { ToolRegistry } = require('./ToolRegistry');
const { LmsAdapterError } = require('../adapters/lms/LmsAdapter');

/**
 * The one way to run a tool:
 *   look up (TOOL_NOT_FOUND) -> access check (TOOL_FORBIDDEN) ->
 *   validateInput (INVALID_TOOL_ARGUMENTS) -> execute(context, args)
 *
 * The caller (agent, execution boundary, later an LLM tool-call) supplies
 * only a tool name and raw arguments; both are untrusted. The context comes
 * from the server-side execution boundary and holds only what tools need.
 * Adapter failures become ADAPTER_FAILURE with a safe message; other
 * unexpected errors become TOOL_EXECUTION_FAILED. No stack traces, secrets
 * or infrastructure details are passed on.
 */
class ToolExecutor {
  constructor({ registry, allowedAccess = ['create'] }) {
    if (!(registry instanceof ToolRegistry)) throw new TypeError('ToolExecutor requires a ToolRegistry.');
    this.registry = registry;
    this.allowedAccess = Object.freeze([...allowedAccess]);
  }

  async run(name, input, context) {
    if (typeof name !== 'string' || !this.registry.has(name)) {
      throw new ValidationError(`Unknown tool "${String(name)}".`, [], { code: 'TOOL_NOT_FOUND', statusCode: 404 });
    }
    const tool = this.registry.get(name);
    if (!this.allowedAccess.includes(tool.access)) {
      throw new ValidationError(`Tool "${name}" is not allowed here.`, [], { code: 'TOOL_FORBIDDEN', statusCode: 403 });
    }

    let args;
    try {
      args = tool.validateInput(input);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ValidationError(err.message, err.details, { code: 'INVALID_TOOL_ARGUMENTS' });
      }
      throw new ValidationError(`Invalid arguments for ${name}.`, [], { code: 'INVALID_TOOL_ARGUMENTS' });
    }

    try {
      return await tool.execute(context, args);
    } catch (err) {
      if (err instanceof ValidationError) throw err; // e.g. APPROVED_DATA_MISMATCH, ROW_NOT_IN_APPROVED_IMPORT
      if (err instanceof LmsAdapterError) {
        throw new ValidationError(err.message, [err.code], { code: 'ADAPTER_FAILURE', statusCode: 502 });
      }
      throw new ValidationError(`Tool "${name}" failed.`, [], { code: 'TOOL_EXECUTION_FAILED', statusCode: 500 });
    }
  }
}

module.exports = { ToolExecutor };
