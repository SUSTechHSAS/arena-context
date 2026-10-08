import { types } from 'node:util';

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
    if (types.isProxy(item)) throw new Error('Unsupported diagnostic kind: Proxy');
    const existing = objects.get(item);
    if (existing !== undefined) return { $ref: existing };
    const id = nextObject++; objects.set(item, id);
    // Intrinsic brands/iterators avoid user Symbol.toStringTag/iterator getters.
    if (types.isMap(item)) return { $id: id, $map: Array.from(Map.prototype.entries.call(item), ([key, entry]) => [visit(key), visit(entry)]), $props: properties(item) };
    if (types.isSet(item)) return { $id: id, $set: Array.from(Set.prototype.values.call(item), visit), $props: properties(item) };
    if (Array.isArray(item)) return { $id: id, $array: properties(item) };
    if (types.isDate(item) || types.isRegExp(item) || types.isNativeError(item) || types.isTypedArray(item) ||
        types.isAnyArrayBuffer(item) || types.isBoxedPrimitive(item) || types.isPromise(item) ||
        types.isWeakMap(item) || types.isWeakSet(item)) throw new Error('Unsupported diagnostic kind');
    const prototype = Object.getPrototypeOf(item) as object | null;
    if (prototype && types.isProxy(prototype)) throw new Error('Unsupported diagnostic kind: proxy prototype');
    const constructor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'constructor') : undefined;
    if (constructor && !('value' in constructor)) throw new Error('Snapshot must not execute constructor accessors');
    const fn = constructor?.value as unknown;
    if (fn && typeof fn !== 'function') throw new Error('Unsupported constructor descriptor');
    if (fn && types.isProxy(fn)) throw new Error('Unsupported diagnostic kind: proxy constructor');
    const nameDescriptor = fn ? Object.getOwnPropertyDescriptor(fn, 'name') : undefined;
    if (nameDescriptor && !('value' in nameDescriptor)) throw new Error('Snapshot must not execute name accessors');
    const name = nameDescriptor?.value as string | undefined;
    return { $id: id, $class: classNames[name ?? ''] ?? name ?? null, $props: properties(item) };
  }
  return visit(value);
}
