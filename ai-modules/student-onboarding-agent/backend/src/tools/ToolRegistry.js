/**
 * Only these access levels exist. There is deliberately no 'update' or
 * 'delete': the agent must never change or remove existing records.
 * A registry can be restricted further (the onboarding registry allows only 'create').
 */
const ALLOWED_ACCESS = ['read', 'create'];

/**
 * Names that suggest generic infrastructure access or mutation of existing
 * records. Such tools must never exist, so they cannot even be registered.
 */
const FORBIDDEN_NAME_PARTS = /(sql|query|command|shell|exec|http|fetch|request|database|update|delete|remove|drop|truncate|alter|upsert|patch)/i;
const TOOL_NAME = /^[a-z][A-Za-z0-9]*$/;

/**
 * Holds the tools the agent may call, keyed by name.
 *
 * A tool is an object with:
 *   description: string                       what it does, explicitly
 *   access: 'read' | 'create'                 never update/delete
 *   inputContract: object                     plain-data description of the accepted arguments
 *   validateInput(input) -> args              deterministic; throws ValidationError on bad input
 *   execute(context, args) -> Promise<any>    receives only validated args and a controlled context
 *
 * Registered tools are frozen, and lock() closes the registry: after that no
 * tool can be added, so nothing at runtime (including LLM output) can define
 * new tools.
 */
class ToolRegistry {
  constructor({ allowedAccess = ALLOWED_ACCESS } = {}) {
    if (!Array.isArray(allowedAccess) || allowedAccess.length === 0 || allowedAccess.some((a) => !ALLOWED_ACCESS.includes(a))) {
      throw new TypeError(`allowedAccess must be a non-empty subset of ${ALLOWED_ACCESS.join(', ')}.`);
    }
    this.allowedAccess = Object.freeze([...allowedAccess]);
    this.tools = new Map();
    this.locked = false;
  }

  register(name, tool) {
    if (this.locked) {
      throw new Error('The tool registry is locked; no tools can be added.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError('Tool name must be a non-empty string.');
    }
    if (!TOOL_NAME.test(name)) {
      throw new TypeError(`Tool name "${name}" must be a camelCase identifier.`);
    }
    if (FORBIDDEN_NAME_PARTS.test(name)) {
      throw new TypeError(`Tool name "${name}" suggests generic infrastructure access or update/delete; such tools are not permitted.`);
    }
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered.`);
    }
    if (!tool || typeof tool !== 'object') {
      throw new TypeError(`Tool "${name}" must be an object.`);
    }
    if (typeof tool.execute !== 'function') {
      throw new TypeError(`Tool "${name}" must implement execute(context, args).`);
    }
    if (typeof tool.validateInput !== 'function') {
      throw new TypeError(`Tool "${name}" must implement validateInput(input).`);
    }
    if (!tool.inputContract || typeof tool.inputContract !== 'object' || Array.isArray(tool.inputContract)) {
      throw new TypeError(`Tool "${name}" must declare an inputContract object.`);
    }
    if (typeof tool.description !== 'string' || tool.description.trim() === '') {
      throw new TypeError(`Tool "${name}" must have a non-empty "description".`);
    }
    if (!ALLOWED_ACCESS.includes(tool.access)) {
      throw new TypeError(
        `Tool "${name}" has access "${tool.access}"; allowed: ${ALLOWED_ACCESS.join(', ')}. ` +
          'Update/delete tools are not permitted.'
      );
    }
    if (!this.allowedAccess.includes(tool.access)) {
      throw new TypeError(`Tool "${name}" has access "${tool.access}"; this registry only allows: ${this.allowedAccess.join(', ')}.`);
    }
    this.tools.set(
      name,
      Object.freeze({
        name,
        description: tool.description,
        access: tool.access,
        inputContract: freezeData(tool.inputContract),
        validateInput: tool.validateInput,
        execute: tool.execute,
      })
    );
    return this;
  }

  /** Closes the registry for good. */
  lock() {
    this.locked = true;
    return this;
  }

  has(name) {
    return this.tools.has(name);
  }

  get(name) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered.`);
    }
    return tool;
  }

  /** Plain-data descriptions (no functions): what each tool does and accepts. */
  list() {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      access: tool.access,
      input: tool.inputContract,
    }));
  }
}

/** Deep-freezes a copy of a small plain-data object (the input contract). */
function freezeData(value) {
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = (v) => {
    if (v && typeof v === 'object') {
      Object.freeze(v);
      Object.values(v).forEach(freeze);
    }
    return v;
  };
  return freeze(copy);
}

module.exports = { ToolRegistry, ALLOWED_ACCESS };
