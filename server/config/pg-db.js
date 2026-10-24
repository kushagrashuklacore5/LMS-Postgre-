'use strict';
/**
 * The LMS database: PostgreSQL behind the callback interface the routes already use
 * (db.run / db.get / db.all / db.exec / db.prepare / db.serialize / db.close, with
 * `this.lastID` and `this.changes` in run callbacks), plus db.transaction() for work that
 * must commit or roll back as one unit on a single connection.
 *
 * What this layer does to each statement (and nothing else):
 *   - `?` placeholders become $1, $2, ... (outside string literals, quoted names and comments);
 *   - an INSERT into a table with an identity `id` gets `RETURNING id`, which fills this.lastID;
 *   - an INSERT that supplies `id` itself moves that table's id sequence past it;
 *   - result columns get back the camelCase the code uses (PostgreSQL folds unquoted names to
 *     lower case: isApproved -> isapproved), from the statement's own text and the schema;
 *   - JS booleans are sent as 1/0 and Dates as epoch milliseconds, as the sqlite3 driver did.
 * Every other piece of SQL is plain PostgreSQL written at the call site.
 *
 * Connection settings come from the environment (see config/postgresConfig.js). The schema is
 * created by `npm run db:migrate`; start-up only checks that it is current.
 */
const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');
const { connectionConfig, describeTarget } = require('./postgresConfig');
const { assertSchemaCurrent, schemaColumnNames } = require('../database/postgres/migrate');

// BIGINT (ids, COUNT(*)) and NUMERIC (SUM, money columns) arrive as JS numbers, as they did from SQLite.
types.setTypeParser(types.builtins.INT8, (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : value;
});
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));
// The schema has no boolean columns (flags are SMALLINT 0/1); a boolean in a result comes from an
// expression such as EXISTS(...) AS enrolled, which SQLite returned as 1/0 and the code expects.
types.setTypeParser(types.builtins.BOOL, (value) => (value === 't' ? 1 : 0));

// lower-case name -> the spelling the code uses, for every column and table in the schema
const SCHEMA_NAMES = new Map();
for (const name of schemaColumnNames()) {
  if (name !== name.toLowerCase()) SCHEMA_NAMES.set(name.toLowerCase(), name);
}

// Advisory lock id held by "exclusive" (writer) transactions, see PgDatabase#transaction.
const WRITER_LOCK = 728_301_456;

// The transaction the current async call chain runs in: { client, tx, done }. Every statement
// issued from inside db.transaction(fn), through any helper, runs on that transaction's connection.
const transactionContext = new AsyncLocalStorage();

/** A table or column name as the code spells it (feestructures -> feeStructures). */
const codeName = (name) => SCHEMA_NAMES.get(name) || name;

/* ------------------------------------------------------------------ SQL translation */

const translated = new Map(); // sql text -> { text, names, insertTable, insertsId, isInsert }
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;

function translate(sql) {
  const cached = translated.get(sql);
  if (cached) return cached;

  let text = '';
  let index = 0;
  const names = new Map();
  for (let i = 0; i < sql.length; ) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      // string literal or quoted name: copied as is ('' and "" are escapes)
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j++;
      }
      text += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const j = end === -1 ? sql.length : end;
      text += sql.slice(i, j);
      i = j;
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const j = end === -1 ? sql.length : end + 2;
      text += sql.slice(i, j);
      i = j;
    } else if (ch === '?') {
      text += `$${++index}`;
      i++;
    } else if (/[A-Za-z_]/.test(ch) && !/[A-Za-z0-9_$]/.test(sql[i - 1] || '')) {
      IDENT.lastIndex = i;
      const word = IDENT.exec(sql)[0];
      // camelCase names only: an all-capitals word is an SQL keyword or function (COUNT, AS)
      if (word !== word.toLowerCase() && word !== word.toUpperCase() && !names.has(word.toLowerCase())) names.set(word.toLowerCase(), word);
      text += word;
      i += word.length;
    } else {
      text += ch;
      i++;
    }
  }

  const insert = /^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?/i.exec(text);
  const entry = {
    text: text.replace(/;\s*$/, ''),
    names,
    isInsert: Boolean(insert),
    insertTable: insert ? insert[1].toLowerCase() : null,
    insertsId: insert && insert[2] ? insert[2].split(',').some((c) => c.trim().replace(/"/g, '').toLowerCase() === 'id') : false,
    returns: /\bRETURNING\b/i.test(text),
  };
  if (translated.size > 5000) translated.clear();
  translated.set(sql, entry);
  return entry;
}

/**
 * For an "invalid input syntax" / "out of range" error caused by a bound value, the set of parameter
 * indexes to bind as NULL instead, or null to report the error:
 *   - '' (an empty form field) anywhere: SQLite kept '' in a numeric column; NULL is "no value" here;
 *   - any other value used only to filter (a SELECT parameter, or a WHERE-clause parameter of an
 *     UPDATE / DELETE): SQLite compared it and found no match, and NULL matches nothing.
 */
function uncastableFilterParams(err, t, text, params) {
  if (!err || (err.code !== '22P02' && err.code !== '22003')) return null;
  const quoted = /"((?:[^"]|"")*)"/.exec(err.message || '');
  if (!quoted) return null;
  const value = quoted[1].replace(/""/g, '"');
  if (value === '') {
    const empty = new Set(params.map((p, i) => (p === '' ? i : -1)).filter((i) => i >= 0));
    return empty.size ? empty : null;
  }
  if (t.isInsert) return null;
  const statement = /^\s*(\w+)/.exec(text);
  const kind = statement ? statement[1].toUpperCase() : '';
  if (!['SELECT', 'WITH', 'UPDATE', 'DELETE'].includes(kind)) return null;
  const where = kind === 'SELECT' || kind === 'WITH' ? -1 : text.search(/\bWHERE\b/i);
  if (kind !== 'SELECT' && kind !== 'WITH' && where < 0) return null;
  const hits = new Set();
  params.forEach((p, i) => {
    if (p === null || String(p) !== value) return;
    const placeholder = new RegExp(`\\$${i + 1}(?!\\d)`, 'g');
    let m;
    while ((m = placeholder.exec(text))) if (m.index < where) return; // also written as a value
    hits.add(i);
  });
  return hits.size ? hits : null;
}

/** The next generated id of `table` follows its highest id (1 for an empty table). */
function resyncIdentity(client, table) {
  return client.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
    [table]
  );
}

function toParam(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return value;
}

/** sqlite3-style arguments: (sql, [params], cb) | (sql, p1, p2, ..., cb) | (sql, cb) */
function splitArgs(args) {
  const list = Array.from(args);
  const callback = typeof list[list.length - 1] === 'function' ? list.pop() : null;
  let params = list.length === 1 && Array.isArray(list[0]) ? list[0] : list;
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !(params[0] instanceof Date) && !Buffer.isBuffer(params[0])) {
    throw new TypeError('Named SQL parameters are not supported; use ? placeholders.');
  }
  return { params: params.map(toParam), callback };
}

function renameColumns(result, names) {
  const fields = result.fields || [];
  const mapped = fields.map((f) => names.get(f.name) || SCHEMA_NAMES.get(f.name) || f.name);
  if (mapped.every((name, i) => name === fields[i].name)) return result.rows;
  return result.rows.map((row) => {
    const out = {};
    fields.forEach((f, i) => { out[mapped[i]] = row[f.name]; });
    return out;
  });
}

/* ------------------------------------------------------------------ execution */

class PgDatabase {
  /** options.connectionString: use this database instead of the environment's (tests, tools). */
  constructor(options = {}) {
    this.options = options;
    this.pool = null;
    this.identityTables = new Set();
    this.ready = null;
    this._serialDepth = 0;
    this._queue = Promise.resolve();
  }

  /** Connects, checks that the schema is fully migrated and learns which tables have identity ids. */
  connect() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const config = this.options.connectionString ? { connectionString: this.options.connectionString } : connectionConfig();
      this.pool = new Pool({
        ...config,
        max: Number(process.env.PG_POOL_MAX) || 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 10000,
        application_name: 'lms-server',
      });
      this.pool.on('error', (err) => console.error('PostgreSQL idle client error:', err.message));
      // A database that is still starting (service just launched) or a slow first connection while the
      // process is busy loading is retried a few times; anything else (wrong password, unknown database)
      // fails at once.
      const attempts = Math.max(1, Number(process.env.PG_CONNECT_ATTEMPTS) || 4);
      for (let attempt = 1; ; attempt++) {
        try {
          await this.pool.query('SELECT 1');
          break;
        } catch (err) {
          const transient = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P03'].includes(err.code) || /connection timeout|timeout expired/i.test(err.message);
          if (!transient || attempt >= attempts) throw new Error(`Cannot connect to PostgreSQL at ${describeTarget(config)}: ${err.message}`);
          if (!this.options.connectionString) console.warn(`PostgreSQL not reachable yet (${err.message}); retrying (${attempt}/${attempts - 1})`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
        }
      }
      await assertSchemaCurrent(this.pool);
      const { rows } = await this.pool.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id' AND is_identity = 'YES'"
      );
      this.identityTables = new Set(rows.map((r) => r.table_name));
      if (!this.options.connectionString) {
        global.isDbConnected = true;
        console.log(`✅ PostgreSQL connected: ${describeTarget(config)}`);
      }
    })();
    // a failed start-up is reported by whoever awaits `ready`; queries report it too
    this.ready.catch(() => { global.isDbConnected = false; });
    return this.ready;
  }

  /** Runs one statement on `client` (pool or a transaction's connection). */
  async _query(client, sql, params) {
    const t = translate(sql);
    const text = t.isInsert && !t.returns && this.identityTables.has(t.insertTable) ? `${t.text} RETURNING id` : t.text;
    let result;
    try {
      result = await client.query(text, params);
    } catch (err) {
      // A bound value that cannot be the column's type ('export' or 999999999999999999999 compared
      // with a BIGINT id): SQLite compared it and found no match. Do the same by binding NULL,
      // which matches nothing - a lookup finds no row, a COUNT is 0, an UPDATE/DELETE changes nothing.
      // Never for INSERTs or values being written, and not inside a transaction (already aborted).
      const retry = client === this.pool && uncastableFilterParams(err, t, text, params);
      if (!retry) throw err;
      result = await client.query(text, params.map((p, i) => (retry.has(i) ? null : p)));
    }
    if (t.insertsId && this.identityTables.has(t.insertTable)) await resyncIdentity(client, t.insertTable);
    const rows = renameColumns(result, t.names);
    const last = t.isInsert && rows.length ? rows[rows.length - 1].id : undefined;
    return { rows, lastID: last, changes: result.rowCount || 0 };
  }

  /** Moves every identity sequence past the highest id of its table (after rows were written with explicit ids). */
  async resyncIdentities() {
    await this.connect();
    const { rows } = await this._client().query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id' AND is_identity = 'YES'"
    );
    this.identityTables = new Set(rows.map((r) => r.table_name));
    for (const table of this.identityTables) await resyncIdentity(this._client(), table);
  }

  /** The open transaction's connection when called from inside one, else the pool. */
  _client() {
    const current = transactionContext.getStore();
    return current && !current.done ? current.client : this.pool;
  }

  /** Queues work: in order while inside serialize(), otherwise straight away. */
  _schedule(work) {
    const start = () => this.connect().then(work);
    if (this._serialDepth > 0) {
      const next = this._queue.then(start, start);
      this._queue = next.catch(() => {});
      return next;
    }
    return start();
  }

  _call(kind, sql, args) {
    let parsed;
    try {
      parsed = splitArgs(args);
    } catch (err) {
      deliver(typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null, err, sql);
      return this;
    }
    const { params, callback } = parsed;
    const done = this._schedule(() => this._query(this._client(), sql, params));
    done.then(
      (r) => {
        if (!callback) return;
        if (kind === 'run') setImmediate(() => callback.call({ lastID: r.lastID, changes: r.changes, sql }, null));
        else if (kind === 'get') setImmediate(() => callback(null, r.rows[0]));
        else setImmediate(() => callback(null, r.rows));
      },
      (err) => deliver(callback, err, sql)
    );
    return this;
  }

  run(sql, ...args) { return this._call('run', sql, args); }
  get(sql, ...args) { return this._call('get', sql, args); }
  all(sql, ...args) { return this._call('all', sql, args); }

  each(sql, ...args) {
    const list = Array.from(args);
    const complete = list.length >= 2 && typeof list[list.length - 1] === 'function' && typeof list[list.length - 2] === 'function' ? list.pop() : null;
    const onRow = list.pop();
    return this.all(sql, ...list, (err, rows) => {
      if (err) return complete ? complete(err) : onRow(err);
      rows.forEach((row) => onRow(null, row));
      if (complete) complete(null, rows.length);
    });
  }

  /** Several statements, no parameters (simple query protocol). */
  exec(sql, callback) {
    const done = this._schedule(() => this._client().query(sql));
    done.then(() => callback && setImmediate(() => callback(null)), (err) => deliver(callback, err, sql));
    return this;
  }

  /** Statements issued inside fn run one after another, in the order issued. */
  serialize(fn) {
    this._serialDepth++;
    try {
      if (fn) fn();
    } finally {
      this._serialDepth--;
    }
  }

  parallelize(fn) {
    const depth = this._serialDepth;
    this._serialDepth = 0;
    try {
      if (fn) fn();
    } finally {
      this._serialDepth = depth;
    }
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  /** The LMS tables, spelled as the code spells them: callback(err, [{ name }]). */
  tables(callback) {
    return this.all(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'
       ORDER BY table_name`,
      (err, rows) => callback(err, err ? undefined : rows.map((r) => ({ name: codeName(r.name) })))
    );
  }

  /** Columns of one table, in order: callback(err, [{ name, type, notnull, pk }]); [] for an unknown table. */
  tableInfo(table, callback) {
    return this.all(
      `SELECT c.column_name AS name, upper(c.data_type) AS type, (c.is_nullable = 'NO')::int AS notnull,
              EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                      JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                      WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name
                        AND tc.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name)::int AS pk
       FROM information_schema.columns c
       WHERE c.table_schema = current_schema() AND c.table_name = lower(?)
       ORDER BY c.ordinal_position`,
      [String(table)],
      (err, rows) => callback(err, err ? undefined : rows.map((r) => ({ ...r, name: codeName(r.name) })))
    );
  }

  /**
   * Runs fn(tx) inside BEGIN ... COMMIT on one connection; any error rolls back and is rethrown.
   * tx.run / tx.get / tx.all take (sql, params) and return promises
   * ({ lastID, changes } / row / rows).
   *
   * { exclusive: true } makes the transaction one of the LMS "writer" transactions, which run one
   * at a time across every server process (a transaction-scoped advisory lock), as SQLite's
   * BEGIN IMMEDIATE did. Waiting for it, or for any other lock, gives up after LMS_DB_LOCK_TIMEOUT_MS
   * (5 s) with SQLSTATE 55P03, which callers treat as "busy, try again".
   * { readOnlySnapshot: true } reads one consistent snapshot of committed data.
   */
  async transaction(fn, { isolationLevel, exclusive = false, readOnlySnapshot = false } = {}) {
    // Called from inside a transaction: join it (one connection, one commit).
    const open = transactionContext.getStore();
    if (open && !open.done) return fn(open.tx);

    await this.connect();
    const client = await this.pool.connect();
    const tx = {
      run: async (sql, params = []) => {
        const r = await this._query(client, sql, params.map(toParam));
        return { lastID: r.lastID, changes: r.changes };
      },
      get: async (sql, params = []) => (await this._query(client, sql, params.map(toParam))).rows[0],
      all: async (sql, params = []) => (await this._query(client, sql, params.map(toParam))).rows,
    };
    const state = { client, tx, done: false };
    try {
      if (readOnlySnapshot) await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      else await client.query(isolationLevel ? `BEGIN ISOLATION LEVEL ${isolationLevel}` : 'BEGIN');
      if (exclusive) {
        const timeoutMs = Number(process.env.LMS_DB_LOCK_TIMEOUT_MS) || 5000;
        await client.query(`SET LOCAL lock_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);
        await client.query('SELECT pg_advisory_xact_lock($1)', [WRITER_LOCK]);
      }
      const value = await transactionContext.run(state, () => fn(tx));
      state.done = true;
      await client.query('COMMIT');
      return value;
    } catch (err) {
      state.done = true;
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      // statements started inside fn but still running afterwards now go to the pool
      state.done = true;
      client.release();
    }
  }

  close(callback) {
    const pool = this.pool;
    this.pool = null;
    this.ready = null;
    const ended = pool ? pool.end() : Promise.resolve();
    ended.then(() => callback && callback(null), (err) => callback && callback(err));
  }
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.chain = Promise.resolve();
  }

  _call(kind, args) {
    // statements of one prepared query run in the order they were issued
    const step = () => new Promise((resolve) => {
      this.db[kind](this.sql, ...args.slice(0, typeof args[args.length - 1] === 'function' ? -1 : undefined), function (err, value) {
        const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
        if (callback) callback.call(this, err, value);
        else if (err) console.error('Database error:', err.message);
        resolve();
      });
    });
    this.chain = this.chain.then(step);
    return this;
  }

  run(...args) { return this._call('run', args); }
  get(...args) { return this._call('get', args); }
  all(...args) { return this._call('all', args); }

  finalize(callback) {
    this.chain.then(() => callback && callback(null));
  }
}

function deliver(callback, err, sql) {
  if (callback) {
    // run callbacks read this.lastID / this.changes even on error, as they could with sqlite3
    setImmediate(() => callback.call({ lastID: undefined, changes: 0, sql }, err));
  } else {
    // no callback: the sqlite3 driver would have raised an 'error' event; log instead of crashing
    console.error('Database error:', err.message, sql ? `\n  in: ${String(sql).replace(/\s+/g, ' ').slice(0, 200)}` : '');
  }
  return undefined;
}

const db = new PgDatabase();
module.exports = db;
module.exports.PgDatabase = PgDatabase;
module.exports.translate = translate;
