/** Identity-aware diagnostic graph. No ignored keys or order normalization.
 * Preserves cycles, aliasing, symbols, Maps/Sets, non-finite numbers, undefined.
 * This is a diagnostic protocol, not the legacy save format.
 */
export function snapshotGraph(root: unknown): unknown {
  const objects = new Map<object, number>(), symbols = new Map<symbol, number>();
  const nodes: unknown[] = [];
  function encode(value: unknown): unknown {
    if (value === undefined) return { primitive: 'undefined' };
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return { number: Object.is(value, -0) ? '-0' : String(value) };
    if (typeof value === 'symbol') {
      if (!symbols.has(value)) symbols.set(value, symbols.size);
      return { symbol: symbols.get(value), globalKey: Symbol.keyFor(value), description: value.description };
    }
    if (typeof value === 'bigint') return { bigint: value.toString() };
    if (typeof value === 'function') throw new Error('Snapshot must select logical data roots, not functions');
    if (value === null || typeof value !== 'object') return value;
    if (objects.has(value)) return { ref: objects.get(value) };
    const id = nodes.length;
    objects.set(value, id); nodes.push(null);
    const type = value.constructor?.name ?? '<null-prototype>';
    if (value instanceof Map) nodes[id] = { type, entries: [...value].map(([k, v]) => [encode(k), encode(v)]) };
    else if (value instanceof Set) nodes[id] = { type, entries: [...value].map(encode) };
    else if (value instanceof Date) nodes[id] = { type, timestamp: encode(value.getTime()) };
    else nodes[id] = { type, properties: Reflect.ownKeys(value).map(key => [encode(key), encode(Reflect.get(value, key))]) };
    return { ref: id };
  }
  const entry = encode(root);
  return { version: 1, entry, nodes };
}
