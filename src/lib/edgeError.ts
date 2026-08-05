import { FunctionsHttpError } from "@supabase/supabase-js";

/** Extracts the real error message from a supabase.functions.invoke failure. */
export async function edgeErrorMessage(e: unknown, fallback = "Request failed"): Promise<string> {
  try {
    if (e instanceof FunctionsHttpError) {
      const body = await e.context.text();
      try {
        const parsed = JSON.parse(body);
        return parsed?.error || parsed?.message || body || fallback;
      } catch {
        return body || fallback;
      }
    }
    if (e instanceof Error) return e.message || fallback;
  } catch {
    /* ignore */
  }
  return fallback;
}