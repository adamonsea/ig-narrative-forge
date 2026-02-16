import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

type UnsubStatus = 'loading' | 'success' | 'already' | 'not_found' | 'invalid' | 'error';

const STATUS_CONFIG: Record<Exclude<UnsubStatus, 'loading'>, { icon: string; title: string; message: string }> = {
  success: {
    icon: '✅',
    title: 'Unsubscribed',
    message: "You've been unsubscribed from this briefing. You won't receive any more emails for this subscription.",
  },
  already: {
    icon: '✅',
    title: 'Already Unsubscribed',
    message: "You've already been unsubscribed from this briefing. No further action needed.",
  },
  not_found: {
    icon: '⚠️',
    title: 'Link Not Found',
    message: 'This unsubscribe link is no longer valid. You may have already unsubscribed.',
  },
  invalid: {
    icon: '⚠️',
    title: 'Invalid Link',
    message: 'This unsubscribe link is invalid or has expired.',
  },
  error: {
    icon: '⚠️',
    title: 'Something went wrong',
    message: "We couldn't process your request. Please try again later.",
  },
};

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') as UnsubStatus | null;
  const displayStatus = status && status in STATUS_CONFIG ? status : 'error';
  const config = STATUS_CONFIG[displayStatus as Exclude<UnsubStatus, 'loading'>];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-3">
          <div className="text-5xl">{config.icon}</div>
          <h1 className="text-2xl font-semibold text-foreground">{config.title}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{config.message}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
