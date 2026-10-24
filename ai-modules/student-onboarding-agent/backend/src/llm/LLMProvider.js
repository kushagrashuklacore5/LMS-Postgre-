/**
 * Provider-agnostic LLM contract. The agent depends only on this shape,
 * never on a vendor SDK.
 *
 * A provider is any object with:
 *   name: string
 *   generate(prompt: string, options?: object) -> Promise<string>
 *
 * Standard options every provider should honour where its API allows:
 *   responseFormat: 'json'   ask the model for a bare JSON response (JSON mode)
 *   temperature: number      0 for the most repeatable output
 *   signal: AbortSignal      abort the request (used for timeouts)
 * Callers must still parse and check the returned text themselves: JSON mode
 * is a request, not a guarantee.
 *
 * Providers report failures by throwing LLMProviderError with a fixed,
 * safe message: never an API key, request body or raw provider response.
 *
 * Concrete providers (Gemini first, OpenAI / Hugging Face later) live in
 * ./providers/ and may extend this class or just match the shape.
 */
class LLMProvider {
  constructor(name) {
    if (new.target === LLMProvider) {
      throw new TypeError('LLMProvider is abstract; extend it with a concrete provider.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError('LLMProvider requires a non-empty provider name.');
    }
    this.name = name;
  }

  // eslint-disable-next-line no-unused-vars
  async generate(prompt, options = {}) {
    throw new Error(`LLM provider "${this.name}" does not implement generate().`);
  }

  /**
   * Throws a TypeError unless `provider` satisfies the contract.
   * Checks shape rather than inheritance so providers stay loosely coupled.
   */
  static assertValid(provider) {
    if (!provider || typeof provider !== 'object') {
      throw new TypeError('LLM provider must be an object.');
    }
    if (typeof provider.name !== 'string' || provider.name.trim() === '') {
      throw new TypeError('LLM provider must have a non-empty string "name".');
    }
    if (typeof provider.generate !== 'function') {
      throw new TypeError(`LLM provider "${provider.name}" must implement generate(prompt, options).`);
    }
    return provider;
  }
}

/**
 * A provider failure that is safe to show: `message` must not contain
 * secrets or raw responses. `code` is e.g. HTTP_ERROR, EMPTY_RESPONSE.
 */
class LLMProviderError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', status = null } = {}) {
    super(message);
    this.name = 'LLMProviderError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { LLMProvider, LLMProviderError };
