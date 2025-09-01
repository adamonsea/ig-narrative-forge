-- Create error tickets table for tracking all system failures
CREATE TABLE public.error_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('scrape', 'generation', 'image', 'system')),
  source_info JSONB NOT NULL DEFAULT '{}',
  error_details TEXT NOT NULL,
  error_code TEXT,
  stack_trace TEXT,
  context_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'current', 'testing', 'backlog')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archived_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create error notifications table for tracking super admin notifications
CREATE TABLE public.error_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES error_tickets(id) ON DELETE CASCADE,
  user_id UUID,
  notification_type TEXT NOT NULL DEFAULT 'bell' CHECK (notification_type IN ('bell', 'email', 'push')),
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.error_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for error tickets (super admin only)
CREATE POLICY "Super admins can manage error tickets"
ON public.error_tickets
FOR ALL
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Service role can insert error tickets"
ON public.error_tickets
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- RLS policies for error notifications
CREATE POLICY "Super admins can manage error notifications"
ON public.error_notifications
FOR ALL
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Service role can insert error notifications"
ON public.error_notifications
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_error_tickets_status ON error_tickets(status) WHERE archived_at IS NULL;
CREATE INDEX idx_error_tickets_created_at ON error_tickets(created_at);
CREATE INDEX idx_error_tickets_type ON error_tickets(ticket_type);
CREATE INDEX idx_error_notifications_ticket_id ON error_notifications(ticket_id);
CREATE INDEX idx_error_notifications_user_id ON error_notifications(user_id);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_error_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_error_tickets_updated_at
  BEFORE UPDATE ON error_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_error_tickets_updated_at();

-- Create function to log errors from edge functions
CREATE OR REPLACE FUNCTION public.log_error_ticket(
  p_ticket_type TEXT,
  p_source_info JSONB,
  p_error_details TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_context_data JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'medium'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ticket_id UUID;
  superadmin_users UUID[];
  admin_user UUID;
BEGIN
  -- Insert error ticket
  INSERT INTO error_tickets (
    ticket_type,
    source_info,
    error_details,
    error_code,
    stack_trace,
    context_data,
    severity
  ) VALUES (
    p_ticket_type,
    p_source_info,
    p_error_details,
    p_error_code,
    p_stack_trace,
    p_context_data,
    p_severity
  ) RETURNING id INTO ticket_id;
  
  -- Get all superadmin users for notifications
  SELECT array_agg(user_id) INTO superadmin_users
  FROM user_roles 
  WHERE role = 'superadmin'::app_role;
  
  -- Create notifications for each superadmin
  IF superadmin_users IS NOT NULL THEN
    FOREACH admin_user IN ARRAY superadmin_users
    LOOP
      INSERT INTO error_notifications (ticket_id, user_id)
      VALUES (ticket_id, admin_user);
    END LOOP;
  END IF;
  
  -- Log to system logs as well
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    CASE p_severity
      WHEN 'critical' THEN 'error'
      WHEN 'high' THEN 'error'
      WHEN 'medium' THEN 'warn'
      ELSE 'info'
    END,
    'Error ticket created: ' || p_error_details,
    jsonb_build_object(
      'ticket_id', ticket_id,
      'ticket_type', p_ticket_type,
      'severity', p_severity,
      'source_info', p_source_info
    ),
    'log_error_ticket'
  );
  
  RETURN ticket_id;
END;
$$;