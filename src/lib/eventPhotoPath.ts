/** True only for Curatr's stored copies in a feed's events folder (topic-assets/{topic}/events/{event}.webp|jpg). */
export function isStoredEventPhoto(path: string | null | undefined): path is string {
  return Boolean(path) && /^[0-9a-f-]{36}\/events\/[0-9a-f-]{36}\.(webp|jpg)$/i.test(path as string);
}
