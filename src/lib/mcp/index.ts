import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listFeeds from "./tools/list-feeds";
import getAccount from "./tools/get-account";
import getFeedHealth from "./tools/get-feed-health";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "curatr",
  title: "Curatr",
  version: "0.1.0",
  instructions:
    "Curatr brings the highlights from your chosen sources into one feed, credited and in your voice. You stay in charge: these tools let you see your feeds, how they are running and your account. You decide what goes live, or let Autopilot publish within your rules.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listFeeds, getAccount, getFeedHealth],
});
