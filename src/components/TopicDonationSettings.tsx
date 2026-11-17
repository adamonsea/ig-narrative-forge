import { InfoHint, SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { isStripePaymentLink, publishableTiers, type DonationTier } from "@/lib/donationTiers";

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

/** Donations save as you go (switch at once, fields when you leave them). Only complete tiers reach readers. */
export const TopicDonationSettings = ({ topicId, donationEnabled, donationConfig, onUpdate }: TopicDonationSettingsProps) => {
  const [enabled, setEnabled] = useState(donationEnabled);
  const [buttonText, setButtonText] = useState(donationConfig.button_text);
  const [tiers, setTiers] = useState<DonationTier[]>(donationConfig.tiers || []);
  const [state, setState] = useState<SaveState>(null);
  const lastSaved = useRef(JSON.stringify({ enabled: donationEnabled, buttonText: donationConfig.button_text, tiers: publishableTiers(donationConfig.tiers || []) }));

  const save = async (next: { enabled?: boolean; buttonText?: string; tiers?: DonationTier[] } = {}) => {
    const e = next.enabled ?? enabled;
    const b = (next.buttonText ?? buttonText).trim() || "Support this feed";
    const t = publishableTiers(next.tiers ?? tiers);
    const snapshot = JSON.stringify({ enabled: e, buttonText: b, tiers: t });
    if (snapshot === lastSaved.current) return;
    setState("saving");
    const { error } = await supabase
      .from("topics")
      .update({ donation_enabled: e, donation_config: { button_text: b, tiers: t } as never })
      .eq("id", topicId);
    if (error) {
      console.error("Error saving donation settings:", error);
      setState("not-saved");
      return;
    }
    lastSaved.current = snapshot;
    setState("saved");
    onUpdate();
    window.setTimeout(() => setState(null), 2000);
  };

  const updateTier = (index: number, field: keyof DonationTier, value: string) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const removeTier = (index: number) => {
    const next = tiers.filter((_, i) => i !== index);
    setTiers(next);
    save({ tiers: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="donations-on" className="text-base">Donations</Label>
          <InfoHint label="About donations">A support button in your feed, paid through Stripe Payment Links.</InfoHint>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={state} />
          <Switch id="donations-on" checked={enabled} onCheckedChange={(v) => { setEnabled(v); save({ enabled: v }); }} />
        </div>
      </div>

      {enabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="button-text" className="text-sm font-medium">Button text</Label>
            <Input id="button-text" value={buttonText} onChange={(e) => setButtonText(e.target.value)} onBlur={() => save()} placeholder="Support this feed" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Tiers</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setTiers([...tiers, { name: "", amount: "", stripe_payment_link: "", description: "" }])} disabled={tiers.length >= 3}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>

            {tiers.length === 0 && <p className="text-base text-muted-foreground">No tiers yet.</p>}

            {tiers.map((tier, index) => {
              const badLink = tier.stripe_payment_link.trim() !== "" && !isStripePaymentLink(tier.stripe_payment_link);
              return (
                <div key={index} className="space-y-4 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-medium">Tier {index + 1}</h4>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTier(index)} aria-label={`Remove tier ${index + 1}`} title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4" onBlur={() => save()}>
                    <div className="space-y-2">
                      <Label htmlFor={`tier-${index}-name`} className="text-sm font-medium">Name</Label>
                      <Input id={`tier-${index}-name`} value={tier.name} onChange={(e) => updateTier(index, "name", e.target.value)} placeholder="Supporter" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tier-${index}-amount`} className="text-sm font-medium">Amount</Label>
                      <Input id={`tier-${index}-amount`} value={tier.amount} onChange={(e) => updateTier(index, "amount", e.target.value)} placeholder="£5/month" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`tier-${index}-link`} className="text-sm font-medium">Payment link</Label>
                        <InfoHint label="About Payment Links">In Stripe: Products, create a product with subscription pricing, then create a Payment Link and paste it here.</InfoHint>
                      </div>
                      <Input id={`tier-${index}-link`} value={tier.stripe_payment_link} onChange={(e) => updateTier(index, "stripe_payment_link", e.target.value)} placeholder="https://buy.stripe.com/…" aria-invalid={badLink} />
                      {badLink && <p className="text-sm text-destructive">Use a Stripe Payment Link.</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tier-${index}-desc`} className="text-sm font-medium">Description</Label>
                      <Textarea id={`tier-${index}-desc`} value={tier.description || ""} onChange={(e) => updateTier(index, "description", e.target.value)} placeholder="Help keep the content flowing" rows={2} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
