import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { supabase } from '@/integrations/supabase/client';
import { PRO_MONTHLY_CREDITS, TOP_UP_CREDITS, WELCOME_CREDITS } from '@/lib/billing';
import { useSubscription } from '@/hooks/useSubscription';
import { CuratrLogo } from '@/components/brand/CuratrLogo';
import { NewsroomBand } from '@/components/home/NewsroomBand';
import { CreditScaleTable } from '@/components/pricing/CreditScaleTable';

const features = [
  'Publish public feeds',
  'RSS, email, widgets and AI assistant access',
  'All image styles and creative tools',
  `${PRO_MONTHLY_CREDITS} creative credits each month`,
];

const freeFeatures = [
  'Create feeds and add your sources',
  'Stories gathered, filtered and written for you',
  'Edit, approve and preview privately',
  `${WELCOME_CREDITS} welcome credits (5 free illustrations)`,
];

export default function Pricing() {
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [voucher, setVoucher] = useState('');
  const [voucherNote, setVoucherNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { user } = useAuth();
  const { subscribed } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  usePageFavicon();

  const checkout = async (kind: 'subscription' | 'top_up') => {
    if (!user) {
      const destination = `/pricing${searchParams.toString() ? `?${searchParams}` : ''}`;
      navigate(`/auth?redirect=${encodeURIComponent(destination)}`);
      return;
    }
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { kind, plan: 'pro', interval, voucherCode: kind === 'subscription' ? voucher.trim() || undefined : undefined, returnUrl: window.location.origin },
      });
      if (error || !data?.url) {
        toast({ title: data?.error || 'Could not open checkout.', variant: 'destructive' });
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  };

  const applyVoucher = async () => {
    if (!user) return navigate('/auth?redirect=/pricing');
    setBusy('voucher');
    const { data, error } = await supabase.functions.invoke('redeem-voucher', { body: { code: voucher.trim() } });
    setBusy(null);
    if (error || data?.error) return setVoucherNote(data?.error || 'That code could not be checked.');
    setVoucherNote(data.message);
    if (data.applied) setTimeout(() => navigate(searchParams.get('returnTo') || '/dashboard'), 800);
  };

  return (
    <div className="relative min-h-screen bg-[hsl(214,50%,9%)] text-white">
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <NewsroomBand overlayClass="bg-[hsl(268,82%,26%)]" />
      </div>
      <Helmet>
        <title>Pricing — Curatr</title>
        <meta name="description" content="Create and curate for free. Publish with Curatr Pro for $19 a month." />
        <link rel="canonical" href="https://curatr.pro/pricing" />
      </Helmet>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 right-0 h-[620px] w-[620px] rounded-full bg-violet-700/20 blur-[150px]" />
        <div className="absolute bottom-0 left-1/4 h-[440px] w-[440px] rounded-full bg-emerald-300/10 blur-[150px]" />
      </div>
      <header className="relative container mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
        <Link to="/" aria-label="Curatr home"><CuratrLogo className="text-3xl text-white" /></Link>
        <Button asChild variant="ghost" className="rounded-full border border-white/15 text-white hover:bg-white/10"><Link to={user ? '/dashboard' : '/auth'}>{user ? 'Your feeds' : 'Sign in'}</Link></Button>
      </header>
      <main className="relative container mx-auto max-w-5xl px-6 pb-24 pt-10">
        <section className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-medium text-emerald-300">{"\n"}</p>
          <h1 className="font-display text-5xl tracking-tight md:text-6xl">Create and plan for free.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">One plan. Every distribution channel. Creative credits included.</p>
        </section>

        <section className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-8">
            <div className="flex items-center justify-between"><p className="text-sm text-white/55">Planning stage</p><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">No card needed</span></div>
            <div className="mt-3 text-4xl font-semibold">$0</div>
            <p className="mt-5 text-white/60">Build your feed. Upgrade when you’re ready to go live and publish.</p>
            <ul className="mt-7 mb-8 space-y-3">{freeFeatures.map((item) => <li key={item} className="flex gap-3 text-sm text-white/75"><Check className="h-5 w-5 shrink-0 text-white/40" />{item}</li>)}</ul>
            <Button asChild variant="outline" className="mt-auto w-full rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"><Link to={user ? '/dashboard' : '/auth'}>Start free</Link></Button>
          </div>

          <div className="rounded-3xl border border-emerald-300/45 bg-white/[0.06] p-8 shadow-2xl shadow-violet-950/30">
            <div className="flex items-center justify-between"><p className="text-sm text-emerald-300">Pro</p><span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">Cancel any time</span></div>
            <div className="mt-3 flex items-baseline gap-2"><span className="text-4xl font-semibold">${interval === 'year' ? '190' : '19'}</span><span className="text-white/50">/{interval === 'year' ? 'year' : 'month'}</span></div>
            <div className="mt-5 inline-flex rounded-full border border-white/15 bg-black/15 p-1 text-sm">
              <button onClick={() => setInterval('month')} className={`rounded-full px-4 py-2 ${interval === 'month' ? 'bg-white text-slate-950' : 'text-white/60'}`}>Monthly</button>
              <button onClick={() => setInterval('year')} className={`rounded-full px-4 py-2 ${interval === 'year' ? 'bg-white text-slate-950' : 'text-white/60'}`}>Yearly · 2 months free</button>
            </div>
            <ul className="mt-7 space-y-3">{features.map((item) => <li key={item} className="flex gap-3 text-sm text-white/75"><Check className="h-5 w-5 shrink-0 text-emerald-300" />{item}</li>)}</ul>
            <Button onClick={() => checkout('subscription')} disabled={busy !== null} className="mt-8 w-full rounded-full bg-emerald-300 text-slate-950 hover:bg-emerald-200">{busy === 'subscription' ? 'Opening checkout…' : 'Unlock with Pro'}</Button>
          </div>
        </section>

        <CreditScaleTable />

        {user && subscribed && <section className="mx-auto mt-6 max-w-4xl rounded-2xl border border-white/10 bg-white/[0.035] p-5 md:flex md:items-center md:justify-between">
          <div><h2 className="font-medium">Need more creative credits?</h2><p className="mt-1 text-sm text-white/55">Add {TOP_UP_CREDITS} credits for $10. Top-ups do not expire.</p></div>
          <Button onClick={() => checkout('top_up')} disabled={busy !== null} variant="outline" className="mt-4 rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 md:mt-0">{busy === 'top_up' ? 'Opening…' : 'Add credits'}</Button>
        </section>}

        <section className="mx-auto mt-12 max-w-xl text-center">
          <p className="text-sm text-white/55">Have a code?</p>
          <div className="mt-3 flex gap-2"><Input value={voucher} onChange={(event) => setVoucher(event.target.value.toUpperCase())} placeholder="Enter code" className="rounded-full border-white/15 bg-white/5 text-white" /><Button onClick={applyVoucher} disabled={busy !== null || voucher.trim().length < 3} variant="outline" className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10">Apply</Button></div>
          {voucherNote && <p className="mt-2 text-sm text-white/65">{voucherNote}</p>}
        </section>
      </main>
    </div>
  );
}