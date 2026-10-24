/**
 * Password hashing for the whole server: bcrypt (cost 10).
 *
 * Uses the native `bcrypt` module, which hashes on libuv worker threads, so a burst of logins does not
 * block the event loop (pure-JS bcryptjs runs on the main thread: every login stalled all other
 * requests, and the server topped out at about one core of logins). Falls back to bcryptjs when the
 * native build is not available on a platform. Both read and write the same $2a$/$2b$ hashes, so
 * existing passwords keep working either way.
 */
let impl;
try {
  impl = require('bcrypt');
} catch {
  impl = require('bcryptjs');
}

module.exports = {
  hash: (password, rounds = 10) => impl.hash(password, rounds),
  compare: (password, hash) => impl.compare(password, hash),
  implementation: impl === require('bcryptjs') ? 'bcryptjs' : 'bcrypt',
};
