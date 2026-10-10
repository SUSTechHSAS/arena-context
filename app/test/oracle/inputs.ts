/** Independent fixture copies preserve aliases/holes/descriptors; not used for comparison. */
export function copyInputs<T>(value: T, seen = new Map<object, object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (value instanceof Map) {
    const result = new Map(); seen.set(value, result);
    for (const [key, item] of value) result.set(copyInputs(key, seen), copyInputs(item, seen));
    return result as T;
  }
  const result = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value)) as object;
  seen.set(value, result);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error('No accessor inputs in this fixture copier');
    Object.defineProperty(result, key, { ...descriptor, value: copyInputs(descriptor.value, seen) });
  }
  return result as T;
}
