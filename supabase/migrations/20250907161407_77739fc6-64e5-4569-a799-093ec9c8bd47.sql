-- Fix remaining function search_path and move extensions to proper schema
ALTER FUNCTION log_error_ticket(text, jsonb, text, text, jsonb) SET search_path = public, extensions;

-- Move extensions from public schema to extensions schema  
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION "uuid-ossp" SET SCHEMA extensions;
ALTER EXTENSION "pg_cron" SET SCHEMA extensions;