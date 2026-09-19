import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  team: 'Team',
};

export const PlanStatus = () => {
  const { subscribed, plan, source, currentPeriodEnd, loading, refresh } = useSubscription();
  const [params, setParams] = useSearchParams();
  const [opening, setOpening] = useState(false);
  const { toast } = useToast();

  // Coming back from Stripe Checkout: confirm and re-check the plan.
  useEffect(() => {
    if (params.get('checkout') === 'success') {
      toast({ title: 'Payment received — thank you! Your plan is being confirmed.' });
      params.delete('checkout');
      setParams(params, { replace: true });
      const timer = setTimeout(() => refresh(), 1500);
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

  const planLabel = plan ? PLAN_LABELS[plan] ?? plan : null;
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
            <span className="font-medium">Free plan</span>
            <span className="text-muted-foreground"> · publishing and distribution need a paid plan</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
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
