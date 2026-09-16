import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, Newspaper, Search, FileText, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MCP_BASE = "https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/mcp-feed";

interface KeyRow {
  id: string;
  key_prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Props {
  topicId: string;
  topicSlug: string;
  topicName: string;
  enabled: boolean;
  access: "open" | "key";
  onChange: (patch: { mcp_enabled?: boolean; mcp_access?: "open" | "key" }) => void;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40);
  return `curatr_${body}`;
}

export const AiAssistantAccess = ({ topicId, topicSlug, topicName, enabled, access, onChange }: Props) => {
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  const endpoint = useMemo(() => `${MCP_BASE}/${topicSlug}`, [topicSlug]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (active) setEntitled(false); return; }
      const { data } = await supabase
        .from("mcp_entitlements")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (active) setEntitled(!!data);
    })();
    return () => { active = false; };
  }, []);

  const loadKeys = useCallback(async () => {
    const { data } = await supabase
      .from("topic_mcp_keys")
      .select("id, key_prefix, label, created_at, last_used_at, revoked_at")
      .eq("topic_id", topicId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    setKeys((data as KeyRow[]) || []);
  }, [topicId]);

  useEffect(() => {
    if (!entitled || !enabled) return;
    loadKeys();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase
      .from("api_usage")
      .select("id", { count: "exact", head: true })
      .eq("service_name", "mcp")
      .eq("region", topicSlug)
      .gte("created_at", since)
      .then(({ count }) => setUsageCount(count ?? 0));
  }, [entitled, enabled, loadKeys, topicSlug]);

  const persist = async (patch: { mcp_enabled?: boolean; mcp_access?: "open" | "key" }) => {
    onChange(patch);
    setSaveError(false);
    const { error } = await supabase.from("topics").update(patch as never).eq("id", topicId);
    if (error) setSaveError(true);
  };

  const createKey = async () => {
    setCreating(true);
    const key = generateKey();
    const hash = await sha256Hex(key);
    const { error } = await supabase.from("topic_mcp_keys").insert({
      topic_id: topicId,
      key_hash: hash,
      key_prefix: key.slice(0, 14),
      label: "Assistant key",
    } as never);
    setCreating(false);
    if (error) { setSaveError(true); return; }
    setNewKey(key);
    loadKeys();
  };

  const revokeKey = async (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    await supabase.from("topic_mcp_keys").update({ revoked_at: new Date().toISOString() } as never).eq("id", id);
  };

  const copy = (value: string, tag: string) => {
    navigator.clipboard.writeText(value);
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1800);
  };

  if (entitled === null || entitled === false) return null;

  return (
    <div className="space-y-5 py-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">AI assistants</Label>
              <Badge variant="secondary" className="text-[10px]">Add-on</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Connect {topicName} to ChatGPT or Claude, so readers can ask questions and get answers straight from your published stories — never anyone else's.
            </p>
            <ul className="mt-3 grid max-w-xl gap-2 sm:grid-cols-2">
              {[
                { icon: Newspaper, title: "Catch me up", body: `"What's new in ${topicName}?" — the latest stories, newest first.` },
                { icon: Search, title: "Find a story", body: `"Anything about the seafront?" — searches everything you've published.` },
                { icon: FileText, title: "Read it in full", body: "The whole story, with the original publication named and linked." },
                { icon: Sparkles, title: "Daily or weekly briefing", body: "A short round-up of your feed on demand." },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium">{title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            {saveError && <p className="mt-1 text-xs text-destructive">Not saved</p>}
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={(checked) => persist({ mcp_enabled: checked })} />
      </div>

      {enabled && (
        <div className="space-y-5 rounded-xl border border-border bg-muted/20 p-5">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase text-muted-foreground">Who can connect</Label>
            <div className="flex flex-wrap gap-2">
              {(["open", "key"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => persist({ mcp_access: option })}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors",
                    access === option ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                  )}
                >
                  {option === "open" ? "Open to anyone" : "Key required"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {access === "open"
                ? "Any assistant can read this feed, just like your public website."
                : "Only people you give a key to can connect."}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase text-muted-foreground">Connection address</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 text-xs">{endpoint}</code>
              <Button variant="outline" size="sm" onClick={() => copy(endpoint, "endpoint")}>
                {copied === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              In ChatGPT or Claude, add a custom connector and paste this address{access === "key" ? ", then paste your key as the authentication token." : "."}
            </p>
          </div>

          {access === "key" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium uppercase text-muted-foreground">Keys</Label>
                <Button variant="outline" size="sm" onClick={createKey} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-2 h-3.5 w-3.5" />}
                  New key
                </Button>
              </div>

              {newKey && (
                <div className="rounded-lg border border-pop/40 bg-background p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Copy this now — it is shown once.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs">{newKey}</code>
                    <Button variant="outline" size="sm" onClick={() => copy(newKey, "key")}>
                      {copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {keys.length === 0 ? (
                <p className="text-xs text-muted-foreground">No keys yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                  {keys.map((key) => (
                    <li key={key.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="font-mono">{key.key_prefix}…</span>
                      <span className="text-muted-foreground">
                        {key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}` : "Never used"}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => revokeKey(key.id)} aria-label="Revoke key">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {usageCount !== null && (
            <p className="text-xs text-muted-foreground">
              {usageCount === 0 ? "No assistant reads in the last 7 days." : `${usageCount} assistant read${usageCount === 1 ? "" : "s"} in the last 7 days.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
