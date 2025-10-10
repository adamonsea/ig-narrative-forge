import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CommunityPulseCard } from "@/components/CommunityPulseCard";
import type { CommunityInsight } from "@/hooks/useCommunityInsights";

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString();

const sampleInsights: CommunityInsight[] = [
  {
    id: "dev-preview-1",
    topic_id: "preview",
    insight_type: "sentiment",
    content: "Residents feel the pier refresh has finally given the seafront a lift and want to see more late-night food spots.",
    confidence_score: 82,
    source_type: "reddit",
    source_identifier: "eastbourne",
    metadata: { mock: true },
    created_at: minutesAgo(20),
  },
  {
    id: "dev-preview-2",
    topic_id: "preview",
    insight_type: "concern",
    content: "Local parents are anxious about rising rents around the town centre and fear creatives will be priced out soon.",
    confidence_score: 67,
    source_type: "reddit",
    source_identifier: "casualuk",
    metadata: { mock: true },
    created_at: minutesAgo(75),
  },
  {
    id: "dev-preview-3",
    topic_id: "preview",
    insight_type: "validation",
    content: "Remote workers love the co-working pop-ups but want better Sunday transport to keep spending in town.",
    confidence_score: 74,
    source_type: "reddit",
    source_identifier: "unitedkingdom",
    metadata: { mock: true },
    created_at: minutesAgo(140),
  },
  {
    id: "dev-preview-4",
    topic_id: "preview",
    insight_type: "sentiment",
    content: "Visitors rave about the independent coffee trail and how friendly the community feels to newcomers.",
    confidence_score: 69,
    source_type: "reddit",
    source_identifier: "brighton",
    metadata: { mock: true },
    created_at: minutesAgo(200),
  },
];

const DevCommunityPulse = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
          <Link to="/" className="hover:underline">
            Back to home
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Community Pulse Preview</h1>
          <p className="text-muted-foreground max-w-2xl">
            This development-only view lets you explore the minimalist community insights card using rich sample data. In
            production the card automatically pulls the latest Reddit sentiment, concerns and validations for each topic.
          </p>
        </div>

        <CommunityPulseCard topicName="Eastbourne" insights={sampleInsights} lastUpdated={sampleInsights[0].created_at} />

        <p className="text-sm text-muted-foreground/80">
          Tip: add <code>?mockCommunity=1</code> to any <code>/feed/&lt;topic&gt;</code> URL while developing to overlay a similar
          snapshot directly within the feed layout.
        </p>
      </div>
    </div>
  );
};

export default DevCommunityPulse;
