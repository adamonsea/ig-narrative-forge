import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { useCredits } from '@/hooks/useCredits';

export const PlanStatus = () => {
  const { subscribed, plan, source, currentPeriodEnd, loading, refresh } = useSubscription();
  const [params, setParams] = useSearchParams();
  const [opening, setOpening] = useState(false);
  const { toast } = useToast();
  const { credits, refreshCredits } = useCredits();

  // Coming back from Stripe Checkout: confirm and re-check the plan.
  useEffect(() => {
    if (params.get('checkout') === 'success') {
      const sessionId = params.get('session_id');
      toast({ title: 'Payment received — confirming your access.' });
      params.delete('checkout');
      params.delete('session_id');
      setParams(params, { replace: true });
      const timer = setTimeout(async () => {
        await refresh(sessionId);
        await refreshCredits();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [params, setParams, refresh, toast]);

  const openPortal = async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error || !data?.url) {
        toast({
          title: data?.error || 'Could not open billing settings right now.',
          variant: 'destructive',
        });
        return;
      }
      window.location.href = data.url as string;
    } finally {
      setOpening(false);
    }
  };

  const planLabel = plan ? 'Pro' : null;
  const renews = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <div className="text-sm">
        {loading && !subscribed ? (
          <span className="text-muted-foreground">Checking your plan…</span>
        ) : subscribed ? (
          <>
            <span className="font-medium">{planLabel ?? 'Active'} plan</span>
            <span className="text-muted-foreground">
              {source === 'voucher' ? ' · free access code' : ''}
              {renews ? ` · ${source === 'voucher' ? 'ends' : 'renews'} ${renews}` : ''}
            </span>
          </>
        ) : (
          <>
             <span className="font-medium">Free</span>
             <span className="text-muted-foreground"> · your feeds stay private until you publish</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{credits?.credits_balance ?? 0} credits</span>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/pricing">Add credits</Link>
        </Button>
        {subscribed && source === 'stripe' ? (
          <Button size="sm" variant="outline" onClick={openPortal} disabled={opening}>
            {opening ? 'Opening…' : 'Manage or cancel'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link to="/pricing">{subscribed ? 'See plans' : 'Choose a plan'}</Link>
          </Button>
        )}
      </div>
    </div>
  );
};
