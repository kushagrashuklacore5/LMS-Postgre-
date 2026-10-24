/**
 * Array map / filter with an async callback, one item at a time and in order (so database
 * statements run in the same sequence as the old synchronous code, also inside a transaction).
 * `items` may be an array or a promise of one.
 */
async function mapInOrder(items, fn) {
  const out = [];
  for (const item of await items) out.push(await fn(item));
  return out;
}

async function filterInOrder(items, fn) {
  const out = [];
  for (const item of await items) if (await fn(item)) out.push(item);
  return out;
}

module.exports = { mapInOrder, filterInOrder };
