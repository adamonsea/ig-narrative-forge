// Admin-only management of the AI assistant add-on entitlement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function findUserByEmail(email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { data: claims, error: claimsError } = await admin.auth.getUser(token);
    if (claimsError || !claims.user) return json({ error: "Unauthorized" }, 401);
    const callerId = claims.user.id;

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "list") {
      const { data, error } = await admin
        .from("mcp_entitlements")
        .select("user_id, notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const withEmails = await Promise.all(rows.map(async (row) => {
        const { data: u } = await admin.auth.admin.getUserById(row.user_id);
        return { ...row, email: u?.user?.email || null };
      }));
      return json({ success: true, entitlements: withEmails });
    }

    const email = String(body.email || "").trim();
    if (!email || email.length > 254 || !email.includes("@")) return json({ error: "A valid email is required" }, 400);
    const user = await findUserByEmail(email);
    if (!user) return json({ error: "No account found with that email" }, 404);

    if (action === "grant") {
      const { error } = await admin
        .from("mcp_entitlements")
        .upsert({ user_id: user.id, granted_by: callerId, notes: body.notes ? String(body.notes).slice(0, 500) : null });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "revoke") {
      const { error } = await admin.from("mcp_entitlements").delete().eq("user_id", user.id);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[mcp-entitlements-admin]", error);
    return json({ error: "Server error" }, 500);
  }
});
