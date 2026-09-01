/**
 * supabase-js turns any non-2xx edge function response into a generic
 * "Edge Function returned a non-2xx status code" error. The function's
 * specific, user-friendly message lives in the response body — read it
 * from the FunctionsHttpError context and fall back gracefully.
 */
export async function extractEdgeFunctionError(fnError: unknown, fallback: string): Promise<string> {
  const response = (fnError as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const payload: unknown = await response.clone().json();
      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.error === 'string' && record.error.trim()) return record.error;
        if (typeof record.message === 'string' && record.message.trim()) return record.message;
      }
    } catch {
      // Body wasn't JSON — fall through to the fallback.
    }
  }
  return fallback;
}
