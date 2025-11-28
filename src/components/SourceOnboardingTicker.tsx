import { Rss, Globe, Handshake, Shield, Sparkles, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";

interface SourceOnboardingTickerProps {
  variant?: 'loading' | 'static';
}

export const SourceOnboardingTicker = ({ variant = 'loading' }: SourceOnboardingTickerProps) => {
  const messages = [
    {
      icon: Rss,
      text: "RSS feeds are the gold standard — structured, reliable content",
      color: "text-accent-green"
    },
    {
      icon: Shield,
      text: "WordPress & Substack sites have predictable RSS formats",
      color: "text-accent-cyan"
    },
    {
      icon: Handshake,
      text: "Direct relationships with publishers = consistent, quality content",
      color: "text-accent-purple"
    },
    {
      icon: AlertTriangle,
      text: "Web scraping is hit-and-miss — some sites block or change layouts",
      color: "text-accent-orange"
    },
    {
      icon: Globe,
      text: "Official .gov and .org sites tend to be more stable",
      color: "text-accent-cyan"
    },
    {
      icon: CheckCircle,
      text: "We validate sources before adding — look for the green checkmark",
      color: "text-accent-green"
    },
    {
      icon: ExternalLink,
      text: "Consider affiliate partnerships for premium, reliable access",
      color: "text-accent-pink"
    },
    {
      icon: Sparkles,
      text: "AI discovers sources based on your keywords and topic type",
      color: "text-accent-purple"
    },
  ];

  if (variant === 'static') {
    return (
      <div className="space-y-3 p-4 bg-background-elevated rounded-lg border border-border/50">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-purple" />
          Tips for Quality Sources
        </h4>
        <div className="grid gap-2">
          {messages.slice(0, 4).map((msg, i) => {
            const Icon = msg.icon;
            return (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className={`w-3.5 h-3.5 ${msg.color}`} />
                <span>{msg.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden h-8 border-t border-border/30 pt-3">
      <div className="animate-[slide-up_24s_ease-in-out_infinite] space-y-2">
        {messages.map((msg, i) => {
          const Icon = msg.icon;
          return (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground py-1.5">
              <Icon className={`w-4 h-4 ${msg.color}`} />
              <span>{msg.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
