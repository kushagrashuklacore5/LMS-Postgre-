const { AssessmentError } = require('../errors');

/**
 * In-memory limits on AI generation per teacher (key = "<school>:<teacher>"):
 * one request in flight (the server-side twin of the UI's disabled button),
 * and at most `maxPerWindow` requests per `windowMs` to bound cost.
 * State is lost on restart, which is acceptable for a cost guard.
 */
class GenerationThrottle {
  constructor({ maxPerWindow = 20, windowMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.now = now;
    this.inFlight = new Set();
    this.history = new Map();
  }

  /** Returns a release() function; throws 429 when the teacher must wait. */
  acquire(key) {
    if (this.inFlight.has(key)) {
      throw new AssessmentError('GENERATION_IN_PROGRESS', 'A generation is already running. Please wait for it to finish.', { statusCode: 429 });
    }
    const since = this.now() - this.windowMs;
    const recent = (this.history.get(key) || []).filter((t) => t > since);
    if (recent.length >= this.maxPerWindow) {
      throw new AssessmentError('GENERATION_LIMIT_REACHED', 'You have reached the AI generation limit for now. Please try again in a few minutes.', { statusCode: 429 });
    }
    recent.push(this.now());
    this.history.set(key, recent);
    this.inFlight.add(key);
    let released = false;
    return () => {
      if (!released) { released = true; this.inFlight.delete(key); }
    };
  }
}

module.exports = { GenerationThrottle };
