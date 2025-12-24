// Utilities for recovering from corrupted Supabase auth storage (e.g., broken refresh tokens)

export const clearSupabaseAuthStorage = () => {
  try {
    // Remove standard auth tokens
    localStorage.removeItem('supabase.auth.token');

    // Remove all Supabase auth keys from localStorage
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        localStorage.removeItem(key);
      }
    }

    // Remove from sessionStorage if in use
    for (const key of Object.keys(sessionStorage || {})) {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
};
