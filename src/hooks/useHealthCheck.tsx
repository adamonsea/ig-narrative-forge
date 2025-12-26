import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

interface HealthCheckResult {
  status: HealthStatus;
  database: boolean;
  auth: boolean;
  latency: number | null;
  lastChecked: Date | null;
  error?: string;
}

export function useHealthCheck(options?: { 
  autoCheck?: boolean; 
  intervalMs?: number;
}) {
  const { autoCheck = false, intervalMs = 60000 } = options || {};
  
  const [health, setHealth] = useState<HealthCheckResult>({
    status: 'unknown',
    database: false,
    auth: false,
    latency: null,
    lastChecked: null,
  });
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = useCallback(async (): Promise<HealthCheckResult> => {
    setIsChecking(true);
    const startTime = Date.now();
    
    let dbHealthy = false;
    let authHealthy = false;
    let error: string | undefined;
    
    try {
      // Quick database check with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const { error: dbError } = await supabase
        .from('topics')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId);
      dbHealthy = !dbError;
      
      if (dbError) {
        error = dbError.message;
      }
    } catch (err) {
      dbHealthy = false;
      error = err instanceof Error ? err.message : 'Database check failed';
    }
    
    try {
      // Quick auth check
      const { error: authError } = await supabase.auth.getSession();
      authHealthy = !authError;
    } catch {
      authHealthy = false;
    }
    
    const latency = Date.now() - startTime;
    
    let status: HealthStatus = 'healthy';
    if (!dbHealthy) {
      status = 'unhealthy';
    } else if (latency > 3000) {
      status = 'degraded';
    } else if (!authHealthy) {
      status = 'degraded';
    }
    
    const result: HealthCheckResult = {
      status,
      database: dbHealthy,
      auth: authHealthy,
      latency,
      lastChecked: new Date(),
      error,
    };
    
    setHealth(result);
    setIsChecking(false);
    
    return result;
  }, []);

  useEffect(() => {
    if (autoCheck) {
      checkHealth();
      const interval = setInterval(checkHealth, intervalMs);
      return () => clearInterval(interval);
    }
  }, [autoCheck, intervalMs, checkHealth]);

  return {
    ...health,
    isChecking,
    checkHealth,
  };
}

// Quick check function for use in error boundaries
export async function quickHealthCheck(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const { error } = await supabase
      .from('topics')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);
    
    clearTimeout(timeoutId);
    return !error;
  } catch {
    return false;
  }
}
