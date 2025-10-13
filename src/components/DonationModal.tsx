import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DonationTier {
  name: string;
  amount: string;
  stripe_payment_link: string;
  description?: string;
}

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  topicId: string;
  buttonText: string;
  tiers: DonationTier[];
  visitorId: string;
}

export const DonationModal = ({
  isOpen,
  onClose,
  topicName,
  topicId,
  buttonText,
  tiers,
  visitorId,
}: DonationModalProps) => {
  const trackInteraction = async (tierName?: string) => {
    try {
      await supabase.from("story_interactions").insert({
        topic_id: topicId,
        story_id: topicId, // Using topic_id as placeholder
        visitor_id: visitorId,
        interaction_type: tierName ? "donation_tier_clicked" : "donation_modal_opened",
        share_platform: tierName || null,
      });
    } catch (error) {
      console.error("Failed to track donation interaction:", error);
    }
  };

  const handleTierClick = (tier: DonationTier) => {
    trackInteraction(tier.name);
    window.open(tier.stripe_payment_link, "_blank", "noopener,noreferrer");
  };

  // Track when modal opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      trackInteraction();
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{buttonText}</DialogTitle>
          <DialogDescription>
            Choose a tier to support {topicName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {tiers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No donation tiers available yet.
            </p>
          ) : (
            tiers.map((tier, index) => (
              <Card key={index} className="cursor-pointer hover:border-primary transition-colors">
                <CardHeader>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <CardDescription className="text-2xl font-bold text-foreground">
                    {tier.amount}
                  </CardDescription>
                </CardHeader>
                {tier.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>
                    <Button onClick={() => handleTierClick(tier)} className="w-full">
                      <Check className="h-4 w-4 mr-2" />
                      Select
                    </Button>
                  </CardContent>
                )}
                {!tier.description && (
                  <CardContent>
                    <Button onClick={() => handleTierClick(tier)} className="w-full">
                      <Check className="h-4 w-4 mr-2" />
                      Select
                    </Button>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
              fill="currentColor"
            />
          </svg>
          Secured by Stripe
        </div>
      </DialogContent>
    </Dialog>
  );
};
