import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface SubscriptionState {
  subscribed: boolean;
  plan: string | null;
  source: 'stripe' | 'voucher' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const EMPTY: SubscriptionState = {
  subscribed: false,
  plan: null,
  source: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export const useSubscription = () => {
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionState>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (sessionId?: string | null) => {
    if (!user) {
      setState(EMPTY);
      return;
    }
    // Only ask the server while we hold a live token — otherwise it answers 401.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      setState(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: sessionId ? { sessionId } : {},
      });
      if (error || !data || data.error) {
        return;
      }
      setState({
        subscribed: !!data.subscribed,
        plan: data.plan ?? null,
        source: data.source ?? null,
        currentPeriodEnd: data.current_period_end ?? null,
        cancelAtPeriodEnd: !!data.cancel_at_period_end,
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh(), 60_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { ...state, loading, refresh };
};
