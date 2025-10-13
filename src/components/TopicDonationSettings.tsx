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
      <Card>
        <CardHeader>
          <CardTitle>Donation Settings</CardTitle>
          <CardDescription>
            Enable donations for your topic using Stripe Payment Links
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Donation Button</Label>
              <p className="text-sm text-muted-foreground">
                Show donation button in the topic feed
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Button Text */}
          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="button-text">Button Text</Label>
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
                  <div>
                    <Label>Subscription Tiers</Label>
                    <p className="text-sm text-muted-foreground">
                      Add up to 3 subscription options (max 3)
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTier}
                    disabled={tiers.length >= 3}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tier
                  </Button>
                </div>

                {tiers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tiers added yet. Click "Add Tier" to create one.
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
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-name`}>Tier Name</Label>
                          <Input
                            id={`tier-${index}-name`}
                            value={tier.name}
                            onChange={(e) => updateTier(index, "name", e.target.value)}
                            placeholder="e.g., Basic Supporter"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-amount`}>Display Amount</Label>
                          <Input
                            id={`tier-${index}-amount`}
                            value={tier.amount}
                            onChange={(e) => updateTier(index, "amount", e.target.value)}
                            placeholder="e.g., $5/month"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-link`}>Stripe Payment Link</Label>
                          <Input
                            id={`tier-${index}-link`}
                            value={tier.stripe_payment_link}
                            onChange={(e) => updateTier(index, "stripe_payment_link", e.target.value)}
                            placeholder="https://buy.stripe.com/..."
                          />
                          <p className="text-xs text-muted-foreground">
                            Create a subscription product in Stripe, then paste the Payment Link here
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`tier-${index}-desc`}>Description (optional)</Label>
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

              {/* Help Text */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-medium text-sm">How to create Stripe Payment Links:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Go to your Stripe Dashboard</li>
                  <li>Navigate to Products → Create product</li>
                  <li>Set up your subscription pricing</li>
                  <li>Generate a Payment Link for the product</li>
                  <li>Copy and paste the link here</li>
                </ol>
                <a
                  href="https://stripe.com/docs/payment-links"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Learn more about Payment Links
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </>
          )}

          {/* Save Button */}
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? "Saving..." : "Save Donation Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
