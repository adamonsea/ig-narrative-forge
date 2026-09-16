import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trash2 } from "lucide-react";

interface Entitlement {
  user_id: string;
  email: string | null;
  created_at: string;
}

export const McpEntitlementsPanel = () => {
  const [rows, setRows] = useState<Entitlement[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("mcp-entitlements-admin", { body: { action: "list" } });
    if (error) { setMessage("Could not load the list"); return; }
    setRows((data?.entitlements as Entitlement[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (action: "grant" | "revoke", value: string) => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("mcp-entitlements-admin", { body: { action, email: value } });
    setBusy(false);
    if (error || data?.error) { setMessage(data?.error || "That didn't work"); return; }
    if (action === "grant") setEmail("");
    load();
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm text-muted-foreground">
          Feed owners with the AI assistant add-on can publish their feeds to ChatGPT and Claude.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={() => act("grant", email)} disabled={busy || !email.includes("@")}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Grant
          </Button>
        </div>
        {message && <p className="text-sm text-destructive">{message}</p>}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has the add-on yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((row) => (
              <li key={row.user_id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{row.email || row.user_id}</span>
                <Button variant="ghost" size="sm" disabled={!row.email} onClick={() => row.email && act("revoke", row.email)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
