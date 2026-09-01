import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Plus, Trash2, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EmailSegment {
  id: string;
  name: string;
  source_domain: string | null;
  signup_source: string | null;
  intro_heading: string | null;
  intro_text: string | null;
  include_events: boolean;
  is_active: boolean;
}

interface EmailSegmentsManagerProps {
  topicId: string;
}

export const EmailSegmentsManager = ({ topicId }: EmailSegmentsManagerProps) => {
  const [segments, setSegments] = useState<EmailSegment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("email_segments")
        .select("id, name, source_domain, signup_source, intro_heading, intro_text, include_events, is_active")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const list = (data || []) as EmailSegment[];
      setSegments(list);

      // Subscriber counts per segment
      const { data: subs } = await (supabase as any)
        .from("topic_newsletter_signups")
        .select("source_domain, signup_source")
        .eq("topic_id", topicId)
        .eq("is_active", true);

      const next: Record<string, number> = {};
      for (const seg of list) {
        next[seg.id] = ((subs || []) as any[]).filter(
          (s) =>
            (!seg.source_domain || s.source_domain === seg.source_domain) &&
            (!seg.signup_source || s.signup_source === seg.signup_source)
        ).length;
      }
      setCounts(next);
    } catch (error) {
      console.error("Failed to load email segments", error);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    load();
  }, [load]);

  const createSegment = async () => {
    setCreating(true);
    try {
      const { error } = await (supabase as any).from("email_segments").insert({
        topic_id: topicId,
        name: "New partner segment",
        include_events: true,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      toast({
        title: "Couldn't create segment",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const updateSegment = async (id: string, patch: Partial<EmailSegment>) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await (supabase as any)
      .from("email_segments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    }
  };

  const deleteSegment = async (id: string) => {
    const { error } = await (supabase as any).from("email_segments").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const preview = async (segment?: EmailSegment) => {
    setPreviewing(segment?.id || "default");
    try {
      const { data, error } = await supabase.functions.invoke("send-email-newsletter", {
        body: {
          topicId,
          notificationType: "weekly",
          previewOnly: true,
          segmentId: segment?.id,
        },
      });
      if (error) throw error;
      if (!data?.html) throw new Error(data?.error || "No preview returned");
      setPreviewHtml(data.html);
      setPreviewLabel(segment ? segment.name : "Everyone else");
    } catch (error) {
      toast({
        title: "Preview failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Email segments
          </Label>
          <p className="text-xs text-muted-foreground">
            Personalise the weekly briefing for readers who signed up on a partner site.
            Anyone matched by a segment is removed from the general send.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={createSegment} disabled={creating}>
          <Plus className="w-4 h-4 mr-2" />
          Add segment
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading segments…</p>
      ) : segments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No segments yet — every subscriber receives the same briefing.
        </p>
      ) : (
        <div className="space-y-3">
          {segments.map((segment) => (
            <div key={segment.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={segment.name}
                  onChange={(e) =>
                    setSegments((prev) =>
                      prev.map((s) => (s.id === segment.id ? { ...s, name: e.target.value } : s))
                    )
                  }
                  onBlur={(e) => updateSegment(segment.id, { name: e.target.value.trim() || "Untitled" })}
                  className="max-w-xs font-medium"
                />
                <Badge variant="secondary">{counts[segment.id] ?? 0} subscribers</Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => preview(segment)}
                    disabled={previewing === segment.id}
                  >
                    {previewing === segment.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    <span className="ml-2">Preview</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${segment.name}`}
                    onClick={() => deleteSegment(segment.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Signed up on domain</Label>
                  <Input
                    value={segment.source_domain || ""}
                    placeholder="eastbourneunltd.co.uk"
                    onChange={(e) =>
                      setSegments((prev) =>
                        prev.map((s) => (s.id === segment.id ? { ...s, source_domain: e.target.value } : s))
                      )
                    }
                    onBlur={(e) => updateSegment(segment.id, { source_domain: e.target.value.trim() || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Signup source (optional)</Label>
                  <Input
                    value={segment.signup_source || ""}
                    placeholder="widget"
                    onChange={(e) =>
                      setSegments((prev) =>
                        prev.map((s) => (s.id === segment.id ? { ...s, signup_source: e.target.value } : s))
                      )
                    }
                    onBlur={(e) => updateSegment(segment.id, { signup_source: e.target.value.trim() || null })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Intro heading</Label>
                <Input
                  value={segment.intro_heading || ""}
                  placeholder="Hello from Eastbourne Chamber"
                  onChange={(e) =>
                    setSegments((prev) =>
                      prev.map((s) => (s.id === segment.id ? { ...s, intro_heading: e.target.value } : s))
                    )
                  }
                  onBlur={(e) => updateSegment(segment.id, { intro_heading: e.target.value.trim() || null })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Intro text</Label>
                <Textarea
                  value={segment.intro_text || ""}
                  rows={2}
                  placeholder="Your weekly round-up of local business news and what's on."
                  onChange={(e) =>
                    setSegments((prev) =>
                      prev.map((s) => (s.id === segment.id ? { ...s, intro_text: e.target.value } : s))
                    )
                  }
                  onBlur={(e) => updateSegment(segment.id, { intro_text: e.target.value.trim() || null })}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`events-${segment.id}`}
                    checked={segment.include_events}
                    onCheckedChange={(checked) => updateSegment(segment.id, { include_events: checked })}
                  />
                  <Label htmlFor={`events-${segment.id}`} className="text-xs">
                    Include "What's on this week"
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`active-${segment.id}`}
                    checked={segment.is_active}
                    onCheckedChange={(checked) => updateSegment(segment.id, { is_active: checked })}
                  />
                  <Label htmlFor={`active-${segment.id}`} className="text-xs">
                    Active
                  </Label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={() => preview()} disabled={previewing === "default"}>
        {previewing === "default" ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Eye className="w-4 h-4 mr-2" />
        )}
        Preview the standard briefing
      </Button>

      <Dialog open={!!previewHtml} onOpenChange={(open) => !open && setPreviewHtml(null)}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Email preview — {previewLabel}</DialogTitle>
          </DialogHeader>
          <iframe
            title={`Email preview for ${previewLabel}`}
            srcDoc={previewHtml || ""}
            className="flex-1 w-full rounded-lg border bg-white"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
