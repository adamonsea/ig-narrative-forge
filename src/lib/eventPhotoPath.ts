/** True only for Curatr's stored copies in a feed's events folder (topic-assets/{topic}/events/{event}[-v{n}].webp|jpg; -v = owner-framed). */
export function isStoredEventPhoto(path: string | null | undefined): path is string {
  return Boolean(path) && /^[0-9a-f-]{36}\/events\/[0-9a-f-]{36}(-v\d+)?\.(webp|jpg)$/i.test(path as string);
}
