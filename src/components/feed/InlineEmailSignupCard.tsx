import { useState, useCallback, useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { saveSubscriptionStatus } from '@/hooks/useNotificationSubscriptions';
import { useToast } from '@/hooks/use-toast';
import { feedBrandPalette, toCss } from '@/lib/feedBrandColor';

interface InlineEmailSignupCardProps {
  topicId: string;
  topicName: string;
  topicSlug: string;
  /** Feed's square icon (preferred) or logo */
  topicLogoUrl?: string;
  /** Feed's configured colour (hex or HSL) */
  brandColor?: string | null;
}

type FrequencyOption = 'daily' | 'weekly';

/**
 * In-feed email sign-up card. Styled as part of the feed it sits in: same card
 * surface as stories, the feed's own icon and colour (contrast-corrected).
 * Uses the existing secure-newsletter-signup flow unchanged.
 */
export const InlineEmailSignupCard = ({
  topicId,
  topicName,
  topicLogoUrl,
  brandColor,
}: InlineEmailSignupCardProps) => {
  const { toast } = useToast();
  const storageKey = `email_briefing_subscribed_${topicId}`;
  const inputId = useId();

  const [isSubscribed, setIsSubscribed] = useState(
    () => localStorage.getItem(storageKey) === 'true'
  );
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<FrequencyOption>('daily');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const brandVars = useMemo(() => {
    const p = feedBrandPalette(brandColor);
    return {
      '--brand-fill': toCss(p.light.fill),
      '--brand-on-fill': toCss(p.light.onFill),
      '--brand-text': toCss(p.light.text),
      '--brand-fill-dark': toCss(p.dark.fill),
      '--brand-on-fill-dark': toCss(p.dark.onFill),
      '--brand-text-dark': toCss(p.dark.text),
    } as CSSProperties;
  }, [brandColor]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      toast({ title: 'Check your email address', description: 'That doesn’t look quite right.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('secure-newsletter-signup', {
        body: { email: email.trim(), topicId, notificationType: frequency },
      });
      if (error) throw error;

      localStorage.setItem(storageKey, 'true');
      saveSubscriptionStatus(topicId, frequency, true);
      setIsSubscribed(true);

      toast({
        title: 'Check your inbox',
        description: `Confirm your email to start getting the ${frequency} ${topicName} briefing.`,
      });
    } catch (err) {
      console.error('Email signup error:', err);
      toast({ title: 'Something went wrong', description: 'Please try again in a moment.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [email, isSubmitting, topicId, frequency, storageKey, toast, topicName]);

  const cardClass =
    'feed-card w-full rounded-xl border border-border/60 shadow-lg overflow-hidden';
  const accentText =
    'text-[color:var(--brand-text)] dark:text-[color:var(--brand-text-dark)]';

  if (isSubscribed) {
    return (
      <section style={brandVars} className={cardClass} aria-label={`${topicName} email briefing`}>
        <div className="flex items-center gap-3 px-6 py-5">
          <Check className={`h-5 w-5 shrink-0 ${accentText}`} aria-hidden />
          <p className="text-base font-medium leading-snug">
            You’re signed up for the {topicName} briefing.
          </p>
        </div>
      </section>
    );
  }

  const initial = topicName.trim().charAt(0).toUpperCase() || '•';

  return (
    <section style={brandVars} className={cardClass} aria-labelledby={`${inputId}-title`}>
      <div className="px-6 py-7 sm:px-8 sm:py-8 space-y-5">
        <div className="flex items-center gap-3">
          {topicLogoUrl && !logoFailed ? (
            <img
              src={topicLogoUrl}
              alt=""
              loading="lazy"
              onError={() => setLogoFailed(true)}
              className="h-10 w-10 rounded-lg object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-semibold bg-[color:var(--brand-fill)] text-[color:var(--brand-on-fill)] dark:bg-[color:var(--brand-fill-dark)] dark:text-[color:var(--brand-on-fill-dark)]"
            >
              {initial}
            </span>
          )}
          <span className="text-[15px] font-medium opacity-80">Free briefing</span>
        </div>

        <div className="space-y-2">
          <h3
            id={`${inputId}-title`}
            className="font-display text-[2rem] leading-[1.1] sm:text-[2.4rem] tracking-tight"
          >
            Never miss another story from{' '}
            <em className={`italic ${accentText}`}>{topicName}</em>
          </h3>
          <p className="text-[17px] sm:text-lg leading-relaxed opacity-85">
            The best of {topicName}, in brief. Straight to your inbox.
          </p>
        </div>

        <div role="radiogroup" aria-label="How often" className="flex gap-2">
          {(['daily', 'weekly'] as const).map((opt) => {
            const active = frequency === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFrequency(opt)}
                className={`h-10 px-4 rounded-full text-[15px] font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-text)] dark:focus-visible:ring-[color:var(--brand-text-dark)] ${
                  active
                    ? 'border-[color:var(--brand-text)] dark:border-[color:var(--brand-text-dark)] bg-[color:var(--brand-fill)]/10 dark:bg-[color:var(--brand-fill-dark)]/15'
                    : 'border-border bg-transparent opacity-80 hover:opacity-100'
                }`}
              >
                {opt === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">Your email</label>
          <input
            id={inputId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
            className="h-12 w-full flex-1 rounded-lg border border-border bg-background/60 px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-text)] dark:focus-visible:ring-[color:var(--brand-text-dark)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-12 shrink-0 rounded-lg px-6 text-base font-semibold transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-text)] disabled:opacity-70 bg-[color:var(--brand-fill)] text-[color:var(--brand-on-fill)] dark:bg-[color:var(--brand-fill-dark)] dark:text-[color:var(--brand-on-fill-dark)] dark:focus-visible:ring-[color:var(--brand-text-dark)]"
          >
            {isSubmitting ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Signing up" />
            ) : (
              'Get the stories'
            )}
          </button>
        </form>

        <p className="text-[15px] leading-snug opacity-80">One-click unsubscribe anytime.</p>
      </div>
    </section>
  );
};
