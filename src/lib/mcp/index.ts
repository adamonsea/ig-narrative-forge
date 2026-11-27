import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listFeeds from "./tools/list-feeds";
import getAccount from "./tools/get-account";
import getFeedHealth from "./tools/get-feed-health";

import draftFeed from "./tools/draft-feed";
import updateSources from "./tools/update-sources";
import setBranding from "./tools/set-branding";
import pinStories from "./tools/pin-stories";
import getPreview from "./tools/get-preview";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "curatr",
  title: "Curatr",
  version: "0.2.0",
  instructions:
    "Curatr brings the highlights from your chosen sources into one feed, credited and in your voice. You stay in charge: check your feeds and account, or set up and change a private draft with sources and its own look. Setup suggestions and Add story use your existing account credits. You decide what goes live, or let Autopilot publish within your rules. These tools never make a feed public. Return its private preview link so the owner can check it and press Publish in Curatr.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listFeeds, getAccount, getFeedHealth, draftFeed, updateSources, setBranding, pinStories, getPreview],
});
