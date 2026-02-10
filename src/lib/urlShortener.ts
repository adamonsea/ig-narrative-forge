import { supabase } from '@/integrations/supabase/client';

// In-memory cache to avoid repeated API calls for the same URL
const cache = new Map<string, string>();

/**
 * Shorten a URL using our own Supabase edge function.
 * Returns the short URL on success, or the original URL on failure (graceful fallback).
 */
export async function shortenUrl(longUrl: string): Promise<string> {
  // Return cached result if available
  const cached = cache.get(longUrl);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const { data, error } = await supabase.functions.invoke('shorten-url', {
      body: { url: longUrl },
    });

    clearTimeout(timeout);

    if (error || !data?.shortUrl) {
      console.warn('URL shortening failed, using original URL');
      return longUrl;
    }

    cache.set(longUrl, data.shortUrl);
    return data.shortUrl;
  } catch (error) {
    console.warn('URL shortening error, using original URL:', error);
    return longUrl;
  }
}
