-- Fix the remaining function search_path security issue
ALTER FUNCTION log_error_ticket(
  p_ticket_type text, 
  p_source_info jsonb, 
  p_error_details text, 
  p_error_code text, 
  p_stack_trace text, 
  p_context_data jsonb, 
  p_severity text
) SET search_path = public, extensions;