-- Fix security warning for function search_path
ALTER FUNCTION update_events_updated_at_column() SET search_path = 'public';

-- Also ensure proper search path for other related functions that might be flagged
-- This addresses the security linter warnings about mutable search paths