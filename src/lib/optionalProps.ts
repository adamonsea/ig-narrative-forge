/**
 * Pass an optional value only when it is defined.
 * With `exactOptionalPropertyTypes`, `prop={maybeUndefined}` is a type error even
 * though React treats a missing prop and an undefined one the same; spreading
 * `{...opt("prop", value)}` keeps that behaviour and satisfies the types.
 */
export function opt<K extends string, V>(key: K, value: V): { [P in K]?: Exclude<V, undefined> } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: Exclude<V, undefined> };
}

/**
 * Drop keys whose value is undefined. JSON (and so every database write)
 * already drops them, so this only makes that explicit for the types.
 */
export function definedOnly<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
