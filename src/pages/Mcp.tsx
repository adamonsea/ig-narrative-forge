import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

const ENDPOINT_BASE = "https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/mcp-feed";

const TOOLS = [
  {
    name: "list_latest_stories",
    summary: "The most recently published stories in a feed, with pictures, source attribution and links.",
    inputs: [{ name: "limit", detail: "optional, 1–25, default 10" }],
  },
  {
    name: "search_stories",
    summary: "Search a feed's published stories by keyword or subject.",
    inputs: [
      { name: "query", detail: "required — words or subject to search for" },
      { name: "limit", detail: "optional, 1–25, default 10" },
    ],
  },
  {
    name: "get_story",
    summary: "Read one published story in full, with its picture, source attribution and link.",
    inputs: [{ name: "story_id", detail: "required — the story id returned by the other tools" }],
  },
  {
    name: "feed_briefing",
    summary: "A short briefing of what a feed published in the last day or week.",
    inputs: [{ name: "period", detail: "optional — 'day' or 'week', default 'week'" }],
  },
];

const STORY_FIELDS = [
  ["headline", "the story headline"],
  ["summary", "a short summary"],
  ["published_at", "publication date (ISO 8601)"],
  ["publication", "the original publication's name"],
  ["author", "the original author, when known"],
  ["original_article_url", "link to the original article — always credit this"],
  ["curatr_url", "link to the story on Curatr"],
  ["image_url", "a picture safe to display"],
  ["image_source", "'curatr_illustration' or 'original_publication' — credit accordingly"],
] as const;

export default function Mcp() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Curatr MCP server — read curated news feeds from AI assistants",
    description:
      "Curatr publishes curated news feeds as MCP (Model Context Protocol) servers. ChatGPT, Claude, Cursor and other MCP-compatible assistants can list stories, search, read full articles and generate briefings, always with source attribution.",
    url: "https://curatr.pro/mcp",
    author: { "@id": "https://curatr.pro/#organization" },
    about: {
      "@type": "SoftwareApplication",
      name: "Curatr MCP feed server",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  };

  return (
    <div className="min-h-dvh bg-background">
      <Helmet>
        <title>Curatr for AI assistants — MCP server documentation</title>
        <meta
          name="description"
          content="Curatr feeds are available as MCP servers. ChatGPT, Claude and other MCP-compatible assistants can list, search and read published stories with full source attribution. Tools, endpoints and connection instructions."
        />
        <link rel="canonical" href="https://curatr.pro/mcp" />
        <meta property="og:title" content="Curatr for AI assistants — MCP server documentation" />
        <meta
          property="og:description"
          content="Every Curatr feed can be read by ChatGPT, Claude and other MCP-compatible assistants — latest stories, search, full articles and briefings, with source attribution."
        />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <header className="border-b border-border/40">
        <div className="mx-auto flex h-12 max-w-3xl items-center px-4">
          <Link to="/" className="text-sm font-semibold tracking-tight text-foreground">
            Curatr
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/discover" className="hover:text-foreground">Discover</Link>
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="display-heading text-3xl text-foreground">Curatr for AI assistants</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Every Curatr feed can be published as an <strong className="text-foreground">MCP server</strong> (Model
          Context Protocol). That lets AI assistants — ChatGPT, Claude, Cursor and anything else that speaks MCP —
          read the feed directly: latest stories, search, full articles and briefings, always with the original
          publication credited and linked.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Endpoint</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One endpoint per feed, using MCP Streamable HTTP (JSON-RPC over POST):
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
{`${ENDPOINT_BASE}/<feed-slug>`}
          </pre>
          <p className="mt-2 text-sm text-muted-foreground">
            For example, the Eastbourne feed:{" "}
            <code className="text-xs text-foreground">{ENDPOINT_BASE}/eastbourne</code>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            A GET request to the same URL returns a plain description of the feed and its endpoint. Feeds are either
            open (no credentials) or protected by a bearer key that the feed owner generates and can revoke.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Tools</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Four read-only tools. They only ever return published stories from the one feed — nothing can write to a
            feed or reach unpublished material.
          </p>
          <div className="mt-4 divide-y divide-border rounded-xl border border-border">
            {TOOLS.map((tool) => (
              <div key={tool.name} className="px-4 py-3">
                <code className="text-sm font-semibold text-foreground">{tool.name}</code>
                <p className="mt-1 text-sm text-muted-foreground">{tool.summary}</p>
                <ul className="mt-1 space-y-0.5">
                  {tool.inputs.map((input) => (
                    <li key={input.name} className="text-xs text-muted-foreground">
                      <code className="text-foreground">{input.name}</code> — {input.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">What each story contains</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {STORY_FIELDS.map(([field, detail]) => (
              <div key={field} className="text-sm">
                <code className="text-xs font-semibold text-foreground">{field}</code>
                <span className="ml-2 text-muted-foreground">{detail}</span>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Attribution rules</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Always name the original publication and include its <code className="text-xs text-foreground">original_article_url</code>.</li>
            <li>Never present a story as your own reporting.</li>
            <li>Pictures marked <code className="text-xs text-foreground">curatr_illustration</code> are Curatr illustrations; others belong to the original publication and must be credited to them.</li>
            <li>Report only what the stories say — if the feed does not cover something, say so.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Connect an assistant</h2>
          <div className="mt-3 space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">ChatGPT</p>
              <p className="mt-1">
                Settings → Connectors → add a custom connector, then paste the feed's endpoint URL. If the feed is
                key-protected, add the key as a bearer token.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Claude</p>
              <p className="mt-1">
                Settings → Integrations → Add integration, and paste the endpoint URL. Claude will discover the four
                tools automatically.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Any MCP client</p>
              <p className="mt-1">
                Use transport <code className="text-xs text-foreground">streamable-http</code> against the endpoint.
                The server speaks protocol version 2024-11-05 and answers initialize, tools/list and tools/call.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-xl border border-border bg-muted/30 p-5">
          <h2 className="text-lg font-semibold text-foreground">Publish your own feed to AI assistants</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Curatr Pro members can switch this on for any feed they own from the feed's Distribution settings — choose
            open access or a shareable key, and see how often assistants read the feed.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              to="/pricing"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              See Curatr Pro
            </Link>
            <Link
              to="/discover"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Browse feeds
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
