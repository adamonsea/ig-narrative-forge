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
import { PRO_MONTHLY_CREDITS, TOP_UP_CREDITS } from '@/lib/billing';

const features = [
  'Publish public feeds',
  'RSS, email, widgets and AI assistant access',
  'All image styles and creative tools',
  `${PRO_MONTHLY_CREDITS} creative credits each month`,
];

export default function Pricing() {
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [voucher, setVoucher] = useState('');
  const [voucherNote, setVoucherNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { user } = useAuth();
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
    <div className="min-h-screen bg-[hsl(214,50%,9%)] text-white">
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
        <Link to="/" className="font-logo text-3xl font-semibold">Curatr<span className="text-xl opacity-70">.pro</span></Link>
        <Button asChild variant="ghost" className="rounded-full border border-white/15 text-white hover:bg-white/10"><Link to={user ? '/dashboard' : '/auth'}>{user ? 'Your feeds' : 'Sign in'}</Link></Button>
      </header>
      <main className="relative container mx-auto max-w-5xl px-6 pb-24 pt-10">
        <section className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-medium text-emerald-300">Free to create and curate.</p>
          <h1 className="font-display text-5xl tracking-tight md:text-6xl">Pay when you publish.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">One plan. Every distribution channel. Creative credits included.</p>
        </section>

        <section className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8">
            <p className="text-sm text-white/55">Free</p>
            <div className="mt-3 text-4xl font-semibold">$0</div>
            <p className="mt-4 text-white/60">Build your feeds privately. Try premium images with welcome credits.</p>
            <Button asChild variant="outline" className="mt-8 w-full rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"><Link to={user ? '/dashboard' : '/auth'}>Start creating</Link></Button>
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

        {user && <section className="mx-auto mt-6 max-w-4xl rounded-2xl border border-white/10 bg-white/[0.035] p-5 md:flex md:items-center md:justify-between">
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