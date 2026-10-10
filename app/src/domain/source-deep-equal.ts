/** Source's item-data comparison, deliberately NOT the diagnostic graph equality.
 * It ignores prototypes/Map entries/symbol keys, uses b.hasOwnProperty directly,
 * and is not cycle-safe. Preserve that contract until a deviation is reviewed.
 */
export function sourceDeepEqual(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (typeof first !== 'object' || typeof second !== 'object' || first === null || second === null) return false;
  const firstKeys = Object.keys(first); const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) return false;
  for (const key of firstKeys) {
    if (!(second as object).hasOwnProperty(key)) return false;
    if (!sourceDeepEqual((first as Record<string, unknown>)[key], (second as Record<string, unknown>)[key])) return false;
  }
  return true;
}
