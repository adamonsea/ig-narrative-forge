import { InfoHint } from "@/components/ui/editorial";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, Newspaper, Search, FileText, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WorkspaceDrawer } from "@/components/workspace/WorkspaceDrawer";
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
  onEnabledChange?: (enabled: boolean) => void;
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

export const AiAssistantAccess = ({ topicId, topicSlug, topicName, enabled, access, onChange, onEnabledChange }: Props) => {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  const endpoint = useMemo(() => `${MCP_BASE}/${topicSlug}`, [topicSlug]);

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
    if (!enabled) return;
    loadKeys();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase
      .from("api_usage")
      .select("id", { count: "exact", head: true })
      .eq("service_name", "mcp")
      .eq("region", topicSlug)
      .gte("created_at", since)
      .then(({ count }) => setUsageCount(count ?? 0));
  }, [enabled, loadKeys, topicSlug]);

  const persist = async (patch: { mcp_enabled?: boolean; mcp_access?: "open" | "key" }) => {
    onChange(patch);
    setSaveError(false);
    if (typeof patch.mcp_enabled === 'boolean') {
      if (onEnabledChange) {
        onEnabledChange(patch.mcp_enabled);
        return;
      }
      const { data, error } = await supabase.rpc('set_topic_distribution' as never, {
        p_topic_id: topicId,
        p_field: 'mcp_enabled',
        p_enabled: patch.mcp_enabled,
      } as never);
      if (error || (data as any)?.success === false) setSaveError(true);
    } else {
      const { error } = await supabase.from("topics").update(patch as never).eq("id", topicId);
      if (error) setSaveError(true);
    }
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

  return (
    <div className="space-y-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">AI assistants</Label>
              <InfoHint label="About AI assistants">Readers can ask ChatGPT or Claude about {topicName}. Answers come only from your published stories, with the original publication credited.</InfoHint>
              <Badge variant="secondary" className="text-sm">Pro</Badge>
            </div>
            {saveError && <p className="mt-1 text-sm text-destructive">Not saved</p>}
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={(checked) => persist({ mcp_enabled: checked })} />
      </div>

      {enabled && (
        <div className="space-y-6 rounded-xl border border-border bg-muted p-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Who can connect</Label>
            <div className="flex flex-wrap gap-2">
              {(["open", "key"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => persist({ mcp_access: option })}
                  aria-pressed={access === option}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors",
                    access === option ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                  )}
                >
                  {option === "open" ? "Open to anyone" : "Key required"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Connection address</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 text-sm">{endpoint}</code>
              <Button variant="outline" size="icon" onClick={() => copy(endpoint, "endpoint")} aria-label="Copy address" title="Copy address">
                {copied === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <SetupGuide tool="ChatGPT" endpoint={endpoint} topicName={topicName} needsKey={access === "key"} />
              <SetupGuide tool="Claude" endpoint={endpoint} topicName={topicName} needsKey={access === "key"} />
            </div>
          </div>

          {access === "key" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Keys</Label>
                <Button variant="outline" size="sm" onClick={createKey} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  New key
                </Button>
              </div>

              {newKey && (
                <div className="rounded-lg border border-pop/40 bg-background p-3">
                  <p className="mb-2 text-sm text-muted-foreground">Shown once.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto whitespace-nowrap text-sm">{newKey}</code>
                    <Button variant="outline" size="icon" onClick={() => copy(newKey, "key")} aria-label="Copy key" title="Copy key">
                      {copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No keys yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                  {keys.map((key) => (
                    <li key={key.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="font-mono">{key.key_prefix}…</span>
                      <span className="text-muted-foreground">
                        {key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}` : "Never used"}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => revokeKey(key.id)} aria-label="Revoke key" title="Revoke key">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {usageCount !== null && (
            <p className="text-sm text-muted-foreground">
              {usageCount === 0 ? "No assistant reads in the last 7 days." : `${usageCount} assistant read${usageCount === 1 ? "" : "s"} in the last 7 days.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

interface SetupGuideProps {
  tool: "ChatGPT" | "Claude";
  endpoint: string;
  topicName: string;
  needsKey: boolean;
}

const SetupGuide = ({ tool, endpoint, topicName, needsKey }: SetupGuideProps) => {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const steps =
    tool === "ChatGPT"
      ? [
          "Open ChatGPT on a computer and sign in.",
          "Click your name at the bottom left, then Settings.",
          "Choose Connectors, then Create (or Add custom connector).",
          `Name it "${topicName}" and paste the address below.`,
          needsKey ? "Choose access token / API key and paste one of your keys." : "Leave authentication set to none.",
          "Save, then start a chat and pick the connector to ask about your feed.",
        ]
      : [
          "Open Claude on a computer and sign in.",
          "Click your name at the bottom left, then Settings.",
          "Choose Connectors, then Add custom connector.",
          `Name it "${topicName}" and paste the address below.`,
          needsKey ? "Add one of your keys as the authentication token." : "Leave authentication empty.",
          "Save, then ask Claude about your feed in any chat.",
        ];

  const copy = () => {
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Add to {tool}</Button>
      <WorkspaceDrawer open={open} onOpenChange={setOpen} title={`Add to ${tool}`} srDescription={`Connect ${topicName} to ${tool}`}>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="text-base">{step}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Address</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted px-3 py-2 text-sm">{endpoint}</code>
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copy address" title="Copy address">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {needsKey && <p className="text-sm text-muted-foreground">Needs a key.</p>}
        </div>
      </WorkspaceDrawer>
    </>
  );
};
