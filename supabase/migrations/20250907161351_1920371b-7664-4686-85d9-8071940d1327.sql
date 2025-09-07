-- Fix function search_path security issues
ALTER FUNCTION normalize_url(text) SET search_path = public, extensions;