import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { defaultWidgetCode } from "@/lib/widgetEmbed";

/** The three sharing basics: email sign-ups, the weekly roundup email, and the widget code. */
export function ShareBasics({
  topicId,
  slug,
  emailEnabled,
  weeklyEnabled,
  widgetEnabled,
  subscriberCount,
  onChannelToggle,
  onTopicPatch,
  onProRequired,
}: {
  topicId: string;
  slug: string;
  emailEnabled: boolean;
  weeklyEnabled: boolean;
  widgetEnabled: boolean;
  subscriberCount: number;
  onChannelToggle: (field: string, checked: boolean, label: string) => void;
  onTopicPatch: (patch: Record<string, unknown>) => void;
  onProRequired?: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const setWeekly = async (next: boolean) => {
    onTopicPatch({ weekly_email_enabled: next });
    const { error } = await supabase.from("topics").update({ weekly_email_enabled: next, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) {
      onTopicPatch({ weekly_email_enabled: !next });
      toast({ title: "Not saved", description: error.message, variant: "destructive" });
    }
  };

  const copyWidget = async () => {
    setCopying(true);
    try {
      if (!widgetEnabled) {
        // The widget only shows headlines once it is switched on for this feed.
        const { data, error } = await supabase.rpc("set_topic_distribution" as never, { p_topic_id: topicId, p_field: "public_widget_builder_enabled", p_enabled: true } as never);
        if ((data as { error?: string } | null)?.error === "pro_required") { onProRequired?.(); return; }
        if (error || (data as { success?: boolean } | null)?.success === false) throw new Error(error?.message || "The widget could not be switched on");
        onTopicPatch({ public_widget_builder_enabled: true });
      }
      await navigator.clipboard.writeText(defaultWidgetCode(slug, window.location.origin));
      setCopied(true);
      toast({ title: "Widget code copied", description: "Paste it into any web page to show your latest headlines." });
      window.setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      toast({ title: "Not copied", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="divide-y divide-border border-y border-border">
      <div className="flex items-start justify-between gap-6 py-5">
        <div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="share-email" className="text-base font-semibold">Email sign-ups</label>
            <InfoHint label="About email sign-ups">Readers can subscribe from the feed.</InfoHint>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}</p>
        </div>
        <Switch id="share-email" checked={emailEnabled} onCheckedChange={(v) => onChannelToggle("email_subscriptions_enabled", v, "Email sign-ups")} className="mt-1" />
      </div>
      <div className="flex items-start justify-between gap-6 py-5">
        <div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="share-weekly" className="text-base font-semibold">Weekly roundup email</label>
            <InfoHint label="About the weekly roundup email">
              The week's best stories, sent to weekly subscribers.{emailEnabled ? "" : " Sent once email sign-ups are on."}
            </InfoHint>
          </div>
        </div>
        <Switch id="share-weekly" checked={weeklyEnabled} disabled={!emailEnabled} onCheckedChange={setWeekly} className="mt-1" />
      </div>
      <div className="flex items-start justify-between gap-6 py-5">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-base font-semibold">Website widget</p>
            <InfoHint label="About the website widget">Show your latest headlines on any website. Copy the code and paste it into a page.</InfoHint>
          </div>
        </div>
        <Button variant="outline" onClick={copyWidget} disabled={copying} className="shrink-0 gap-1.5">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
    </div>
  );
}
