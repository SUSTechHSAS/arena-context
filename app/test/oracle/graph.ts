/** Explicit, identity-aware diagnostic graph; unsupported kinds fail, not normalize. */
export function graphSnapshot(value: unknown, classNames: Record<string, string> = {}): unknown {
  const objects = new Map<object, number>();
  const symbols = new Map<symbol, number>();
  let nextObject = 0; let nextSymbol = 0;
  function properties(item: object): unknown[] {
    return Reflect.ownKeys(item).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!('value' in descriptor)) throw new Error('Snapshot must not execute accessors');
      return [typeof key === 'symbol' ? visit(key) : key, visit(descriptor.value),
        descriptor.enumerable, descriptor.writable, descriptor.configurable];
    });
  }
  function visit(item: unknown): unknown {
    if (typeof item === 'number') {
      if (Number.isNaN(item)) return { $number: 'NaN' };
      if (Object.is(item, -0)) return { $number: '-0' };
      if (!Number.isFinite(item)) return { $number: String(item) };
      return item;
    }
    if (typeof item === 'undefined') return { $undefined: true };
    if (typeof item === 'bigint') return { $bigint: String(item) };
    if (typeof item === 'symbol') {
      const existing = symbols.get(item);
      if (existing !== undefined) return { $symbolRef: existing };
      const id = nextSymbol++; symbols.set(item, id);
      return { $symbol: id, description: item.description, globalKey: Symbol.keyFor(item) };
    }
    if (item === null || typeof item !== 'object') {
      if (typeof item === 'function') throw new Error('Snapshot contract must explicitly exclude behavior, not silently erase functions');
      return item;
    }
    const existing = objects.get(item);
    if (existing !== undefined) return { $ref: existing };
    const id = nextObject++; objects.set(item, id);
    const tag = Object.prototype.toString.call(item);
    if (tag === '[object Map]') return { $id: id, $map: Array.from(item as Map<unknown, unknown>, ([key, entry]) => [visit(key), visit(entry)]), $props: properties(item) };
    if (tag === '[object Set]') return { $id: id, $set: Array.from(item as Set<unknown>, visit), $props: properties(item) };
    if (Array.isArray(item)) return { $id: id, $array: properties(item) };
    if (tag !== '[object Object]') throw new Error(`Unsupported diagnostic kind: ${tag}`);
    const prototype = Object.getPrototypeOf(item) as object | null;
    const constructor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'constructor') : undefined;
    if (constructor && !('value' in constructor)) throw new Error('Snapshot must not execute constructor accessors');
    const name = constructor?.value?.name as string | undefined;
    return { $id: id, $class: classNames[name ?? ''] ?? name ?? null, $props: properties(item) };
  }
  return visit(value);
}
