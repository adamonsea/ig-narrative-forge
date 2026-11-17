import { InfoHint } from "@/components/ui/editorial";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface DonationTier {
  name: string;
  amount: string;
  stripe_payment_link: string;
  description?: string;
}

interface DonationConfig {
  button_text: string;
  tiers: DonationTier[];
}

interface TopicDonationSettingsProps {
  topicId: string;
  donationEnabled: boolean;
  donationConfig: DonationConfig;
  onUpdate: () => void;
}

export const TopicDonationSettings = ({
  topicId,
  donationEnabled,
  donationConfig,
  onUpdate,
}: TopicDonationSettingsProps) => {
  const [enabled, setEnabled] = useState(donationEnabled);
  const [buttonText, setButtonText] = useState(donationConfig.button_text);
  const [tiers, setTiers] = useState<DonationTier[]>(donationConfig.tiers || []);
  const [isSaving, setIsSaving] = useState(false);

  const addTier = () => {
    if (tiers.length >= 3) {
      toast.error("Maximum 3 tiers allowed");
      return;
    }
    setTiers([...tiers, { name: "", amount: "", stripe_payment_link: "", description: "" }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: keyof DonationTier, value: string) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  };

  const validatePaymentLink = (url: string): boolean => {
    return url.startsWith("https://buy.stripe.com/") || url.startsWith("https://checkout.stripe.com/");
  };

  const handleSave = async () => {
    // Validate tiers
    for (const tier of tiers) {
      if (!tier.name || !tier.amount || !tier.stripe_payment_link) {
        toast.error("All tier fields are required");
        return;
      }
      if (!validatePaymentLink(tier.stripe_payment_link)) {
        toast.error("Invalid Stripe Payment Link URL");
        return;
      }
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("topics")
        .update({
          donation_enabled: enabled,
          donation_config: {
            button_text: buttonText,
            tiers: tiers,
          } as any,
        })
        .eq("id", topicId);

      if (error) throw error;

      toast.success("Donation settings saved");
      onUpdate();
    } catch (error) {
      console.error("Error saving donation settings:", error);
      toast.error("Failed to save donation settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label>Donations</Label>
              <InfoHint label="About donations">A support button in your feed, paid through Stripe Payment Links.</InfoHint>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Button Text */}
          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="button-text">Button text</Label>
                <Input
                  id="button-text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="Support this feed"
                />
              </div>

              {/* Tiers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Tiers</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTier}
                    disabled={tiers.length >= 3}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>

                {tiers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tiers yet.
                  </p>
                )}

                {tiers.map((tier, index) => (
                  <Card key={index}>
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Tier {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTier(index)}
                          aria-label={`Remove tier ${index + 1}`}
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-name`}>Name</Label>
                          <Input
                            id={`tier-${index}-name`}
                            value={tier.name}
                            onChange={(e) => updateTier(index, "name", e.target.value)}
                            placeholder="e.g., Basic Supporter"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-amount`}>Amount</Label>
                          <Input
                            id={`tier-${index}-amount`}
                            value={tier.amount}
                            onChange={(e) => updateTier(index, "amount", e.target.value)}
                            placeholder="e.g., $5/month"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor={`tier-${index}-link`}>Stripe Payment Link</Label>
                            <InfoHint label="About Payment Links">In Stripe: Products, create a product with subscription pricing, then create a Payment Link and paste it here.</InfoHint>
                          </div>
                          <Input
                            id={`tier-${index}-link`}
                            value={tier.stripe_payment_link}
                            onChange={(e) => updateTier(index, "stripe_payment_link", e.target.value)}
                            placeholder="https://buy.stripe.com/..."
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-desc`}>Description</Label>
                          <Textarea
                            id={`tier-${index}-desc`}
                            value={tier.description || ""}
                            onChange={(e) => updateTier(index, "description", e.target.value)}
                            placeholder="Help keep the content flowing"
                            rows={2}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

            </>
          )}

          {/* Save Button */}
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
      </div>
    </div>
  );
};
