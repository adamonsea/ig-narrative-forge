// In-memory cache to avoid repeated API calls for the same URL
const cache = new Map<string, string>();

/**
 * Shorten a URL using is.gd's free API.
 * Returns the short URL on success, or the original URL on failure (graceful fallback).
 */
export async function shortenUrl(longUrl: string): Promise<string> {
  // Return cached result if available
  const cached = cache.get(longUrl);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('URL shortening failed, using original URL');
      return longUrl;
    }

    const shortUrl = (await response.text()).trim();

    // Validate we got a real URL back
    if (shortUrl.startsWith('https://is.gd/')) {
      cache.set(longUrl, shortUrl);
      return shortUrl;
    }

    return longUrl;
  } catch (error) {
    console.warn('URL shortening error, using original URL:', error);
    return longUrl;
  }
}
