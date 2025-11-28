import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Zap, Crown, Building2 } from 'lucide-react';
import { WaitlistModal } from '@/components/WaitlistModal';
import { usePageFavicon } from '@/hooks/usePageFavicon';

interface PricingTier {
  name: string;
  price: string;
  credits: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  highlight?: boolean;
  accentColor: string;
}

const tiers: PricingTier[] = [
  {
    name: 'Starter',
    price: '$19',
    credits: '500 AI credits/mo',
    description: 'Perfect for individual creators getting started',
    icon: <Zap className="h-6 w-6" />,
    accentColor: 'hsl(155,100%,67%)',
    features: [
      'Up to 3 feeds',
      'AI content simplification',
      'Basic analytics',
      'Source management',
      'Email support',
    ],
  },
  {
    name: 'Pro',
    price: '$49',
    credits: '2,000 AI credits/mo',
    description: 'For serious curators building engaged audiences',
    icon: <Crown className="h-6 w-6" />,
    accentColor: 'hsl(270,100%,68%)',
    highlight: true,
    features: [
      'Unlimited feeds',
      'AI illustrations & visuals',
      'Play Mode gamification',
      'Quiz card generation',
      'Community insights',
      'Advanced analytics',
      'Priority support',
    ],
  },
  {
    name: 'Team',
    price: '$149',
    credits: '10,000 AI credits/mo',
    description: 'For organizations with multiple editorial teams',
    icon: <Building2 className="h-6 w-6" />,
    accentColor: 'hsl(155,100%,67%)',
    features: [
      'Everything in Pro',
      'Team collaboration',
      'Multiple workspaces',
      'Custom branding',
      'API access',
      'Dedicated account manager',
      'SLA guarantee',
    ],
  },
];

const Pricing = () => {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  
  usePageFavicon();

  const openWaitlist = (planName: string) => {
    setSelectedPlan(planName);
    setWaitlistOpen(true);
  };

  return (
    <div className="min-h-screen bg-[hsl(214,50%,9%)]">
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[hsl(270,80%,25%)] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] bg-[hsl(270,100%,68%)] rounded-full blur-[180px] opacity-10" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[hsl(155,100%,67%)] rounded-full blur-[160px] opacity-5" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center max-w-7xl mx-auto">
            <Link to="/" className="text-3xl font-display font-semibold tracking-tight text-white">
              Curatr<span className="text-xl opacity-70">.pro</span>
            </Link>
            <Button asChild variant="ghost" size="lg" className="rounded-full text-white hover:bg-[hsl(270,100%,68%)]/20 border border-[hsl(270,100%,68%)]/30">
              <Link to="/auth">Sign in</Link>
            </Button>
          </nav>
        </header>

        <main className="container mx-auto px-6 pb-24">
          {/* Hero */}
          <section className="max-w-4xl mx-auto text-center py-16 space-y-6">
            <h1 className="text-5xl md:text-6xl font-display font-semibold tracking-tight text-white">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Choose the plan that fits your needs. All plans include AI-powered curation tools with flexible credit allocation.
            </p>
          </section>

          {/* Credit explainer */}
          <section className="max-w-3xl mx-auto mb-16">
            <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-[hsl(270,100%,68%)]/20">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(270,100%,68%)]/30 shrink-0">
                  <Zap className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">How AI credits work</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Credits power AI features like content simplification, illustration generation, quiz creation, and sentiment analysis. 
                    Usage varies by feature—simple rewrites use fewer credits, while image generation uses more. 
                    Unused credits don't roll over, but you can always add more.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing cards */}
          <section className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`relative rounded-3xl p-8 ${
                    tier.highlight
                      ? 'bg-[hsl(214,50%,14%)] border-2 border-[hsl(270,100%,68%)]/50'
                      : 'bg-[hsl(214,50%,12%)] border border-white/10'
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[hsl(270,100%,68%)] rounded-full text-sm font-medium text-white">
                      Most popular
                    </div>
                  )}
                  
                  <div className="space-y-6">
                    {/* Icon and name */}
                    <div className="flex items-center gap-3">
                      <div 
                        className="rounded-xl w-12 h-12 flex items-center justify-center border"
                        style={{ 
                          backgroundColor: `${tier.accentColor}15`,
                          borderColor: `${tier.accentColor}40`,
                          color: tier.accentColor
                        }}
                      >
                        {tier.icon}
                      </div>
                      <h3 className="text-2xl font-semibold text-white">{tier.name}</h3>
                    </div>

                    {/* Price */}
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-white">{tier.price}</span>
                        <span className="text-white/50">/month</span>
                      </div>
                      <div className="text-sm mt-1" style={{ color: tier.accentColor }}>
                        {tier.credits}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-white/60 text-sm">{tier.description}</p>

                    {/* CTA Button */}
                    <Button
                      onClick={() => openWaitlist(tier.name)}
                      className={`w-full h-12 rounded-full font-medium ${
                        tier.highlight
                          ? 'bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,60%)] text-white'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                      }`}
                    >
                      Coming soon
                    </Button>

                    {/* Features */}
                    <ul className="space-y-3 pt-4 border-t border-white/10">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <Check 
                            className="h-5 w-5 shrink-0 mt-0.5" 
                            style={{ color: tier.accentColor }}
                          />
                          <span className="text-white/70 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ or extra info */}
          <section className="max-w-2xl mx-auto text-center mt-20">
            <p className="text-white/50">
              Need a custom plan for your organization?{' '}
              <button 
                onClick={() => openWaitlist('Enterprise')}
                className="text-[hsl(270,100%,68%)] hover:underline"
              >
                Contact us
              </button>
            </p>
          </section>
        </main>
      </div>

      <WaitlistModal 
        open={waitlistOpen} 
        onOpenChange={setWaitlistOpen}
        planName={selectedPlan}
      />
    </div>
  );
};

export default Pricing;
