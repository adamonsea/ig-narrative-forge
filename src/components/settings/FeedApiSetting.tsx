import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingRow } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Status { has_token: boolean; prefix: string | null; last_used_at: string | null; include_photos: boolean }

const rpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);

/** Settings → Share → API: one read-only events token per feed (shown once, hash stored) and "Include photos". */
export function FeedApiSetting({ topicId, slug }: { topicId: string; slug: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await rpc("get_feed_api_status", { p_topic_id: topicId });
    if (e) { setError(true); return; }
    setStatus(data as unknown as Status);
  }, [topicId]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true); setError(false);
    const { data, error: e } = await rpc("create_feed_api_token", { p_topic_id: topicId });
    setBusy(false);
    if (e || typeof data !== "string") { setError(true); return; }
    setToken(data); void load();
  };
  const revoke = async () => {
    setError(false);
    const { error: e } = await rpc("revoke_feed_api_token", { p_topic_id: topicId });
    if (e) { setError(true); return; }
    setToken(null); void load();
  };
  const setPhotos = async (on: boolean) => {
    setStatus((s) => (s ? { ...s, include_photos: on } : s));
    const { error: e } = await rpc("set_feed_api_photos", { p_topic_id: topicId, p_on: on });
    if (e) { setError(true); void load(); }
  };
  const copy = async (v: string) => {
    try { await navigator.clipboard.writeText(v); } catch { return; }
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };

  const endpoint = `https://curatr.pro/api/public/feed-api/v1/events?feed=${slug}`;
  const lastUsed = status?.last_used_at ? `Last used ${new Date(status.last_used_at).toLocaleDateString()}` : "Never used";

  return (
    <div className="divide-y divide-border">
      <SettingRow label="API token" hint={error ? "Not saved. Try again." : status?.has_token ? `${status.prefix}… · ${lastUsed}` : "Read-only access to your events."} stack>
        <div className="space-y-3">
          {token && (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="mb-2 text-sm text-muted-foreground">Shown once.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto whitespace-nowrap text-base">{token}</code>
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => void copy(token)} aria-label="Copy token" title="Copy token">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {status?.has_token ? (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" className="min-h-11" disabled={busy}>Reset</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset token?</AlertDialogTitle>
                      <AlertDialogDescription>The current token stops working.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void create()}>Reset</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" className="min-h-11">Revoke</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke token?</AlertDialogTitle>
                      <AlertDialogDescription>Anything using it stops getting events.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void revoke()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Revoke</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <Button variant="outline" className="min-h-11" onClick={() => void create()} disabled={busy || !status}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Create token
              </Button>
            )}
          </div>
        </div>
      </SettingRow>
      {status?.has_token && (
        <SettingRow label="Endpoint" stack>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 text-sm">{endpoint}</code>
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => void copy(endpoint)} aria-label="Copy endpoint" title="Copy endpoint"><Copy className="h-4 w-4" /></Button>
          </div>
        </SettingRow>
      )}
      <SettingRow label="Include photos" hint="Credited to the source.">
        <Switch aria-label="Include photos" checked={status?.include_photos ?? false} disabled={!status} onCheckedChange={(v) => void setPhotos(v)} />
      </SettingRow>
    </div>
  );
}
