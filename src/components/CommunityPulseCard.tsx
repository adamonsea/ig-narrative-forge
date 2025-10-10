import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Radio, Thermometer, Sparkles } from "lucide-react";
import { CommunityInsight } from "@/hooks/useCommunityInsights";

interface CommunityPulseCardProps {
  topicName: string;
  insights: CommunityInsight[];
  lastUpdated?: string | null;
}

const STOP_WORDS = new Set([
  "the", "and", "that", "with", "from", "this", "have", "about", "what", "when",
  "where", "your", "into", "just", "they", "them", "will", "there", "their",
  "been", "over", "under", "more", "most", "very", "such", "also", "could",
  "should", "would", "might", "because", "while", "again", "around",
]);

const keywordPositions = [
  { top: "8%", left: "50%", translate: "-50% 0" },
  { top: "25%", left: "85%", translate: "-50% -50%" },
  { top: "60%", left: "88%", translate: "-50% -50%" },
  { top: "82%", left: "50%", translate: "-50% -100%" },
  { top: "62%", left: "15%", translate: "-50% -50%" },
  { top: "28%", left: "12%", translate: "-50% -50%" },
];

const typeColorMap: Record<CommunityInsight["insight_type"], string> = {
  sentiment: "text-emerald-500 dark:text-emerald-300",
  concern: "text-amber-500 dark:text-amber-300",
  validation: "text-sky-500 dark:text-sky-300",
};

const typeLabelMap: Record<CommunityInsight["insight_type"], string> = {
  sentiment: "Positive",
  concern: "Concerns",
  validation: "Ideas",
};

const cleanTopicName = (topicName: string) =>
  topicName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();

const extractKeywords = (insights: CommunityInsight[], topicName: string) => {
  const normalizedTopic = cleanTopicName(topicName);
  const topicTokens = new Set(normalizedTopic.split(/\s+/).filter(Boolean));
  const keywordMap = new Map<
    string,
    {
      score: number;
      mentions: number;
      typeCounts: Record<CommunityInsight["insight_type"], number>;
    }
  >();

  insights.forEach((insight) => {
    const cleaned = insight.content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const uniqueWords = new Set(cleaned);

    uniqueWords.forEach((word) => {
      if (word.length < 4) return;
      if (STOP_WORDS.has(word)) return;
      if (topicTokens.has(word)) return;

      const existing = keywordMap.get(word) || {
        score: 0,
        mentions: 0,
        typeCounts: { sentiment: 0, concern: 0, validation: 0 },
      };

      const confidenceBoost = (insight.confidence_score || 0) / 100;
      existing.score += 1 + confidenceBoost;
      existing.mentions += 1;
      existing.typeCounts[insight.insight_type] += 1;

      keywordMap.set(word, existing);
    });
  });

  const sorted = Array.from(keywordMap.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, keywordPositions.length)
    .map(([word, data]) => {
      const dominantType = (Object.entries(data.typeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "sentiment") as CommunityInsight["insight_type"];

      return {
        word,
        weight: data.score,
        mentions: data.mentions,
        dominantType,
      };
    });

  return sorted;
};

const calculateTemperature = (insights: CommunityInsight[]) => {
  if (insights.length === 0) return 50;

  const sentimentCount = insights.filter((i) => i.insight_type === "sentiment").length;
  const concernCount = insights.filter((i) => i.insight_type === "concern").length;
  const validationCount = insights.filter((i) => i.insight_type === "validation").length;

  const weightedPositive = sentimentCount * 1.2 + validationCount * 0.8;
  const weightedNegative = concernCount * 1.4;
  const balance = weightedPositive - weightedNegative;
  const normalized = 50 + (balance / Math.max(insights.length, 1)) * 35;

  return Math.min(95, Math.max(5, Math.round(normalized)));
};

const averageConfidence = (insights: CommunityInsight[]) => {
  if (insights.length === 0) return null;
  const total = insights.reduce((sum, insight) => sum + (insight.confidence_score || 0), 0);
  return Math.round(total / insights.length);
};

const getLatestInsight = (insights: CommunityInsight[]) => {
  return insights[0];
};

const uniqueSources = (insights: CommunityInsight[]) => {
  return Array.from(new Set(insights.map((insight) => insight.source_identifier))).slice(0, 4);
};

export const CommunityPulseCard = ({ topicName, insights, lastUpdated }: CommunityPulseCardProps) => {
  if (!insights || insights.length === 0) return null;

  const keywords = extractKeywords(insights, topicName);
  const temperature = calculateTemperature(insights);
  const confidence = averageConfidence(insights);
  const latest = getLatestInsight(insights);
  const sources = uniqueSources(insights);

  const weights = keywords.map((keyword) => keyword.weight);
  const minWeight = weights.length > 0 ? Math.min(...weights) : 0;
  const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;

  return (
    <Card className="w-full max-w-2xl border-border/40 bg-gradient-to-br from-slate-50/60 via-white/80 to-slate-100/60 dark:from-slate-900/40 dark:via-slate-950/60 dark:to-slate-900/20 backdrop-blur-sm overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="relative flex-1 min-w-[220px]">
            <div className="relative aspect-square rounded-full border border-border/30 bg-gradient-to-br from-primary/10 via-transparent to-primary/5">
              <div className="absolute inset-[18%] rounded-full border border-border/40 bg-background/80 flex flex-col items-center justify-center text-center px-4">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Community</span>
                <span className="text-lg font-semibold mt-1">{topicName}</span>
                <span className="text-xs text-muted-foreground mt-1">Pulse Snapshot</span>
              </div>

              {keywords.map((keyword, index) => {
                const weightRange = maxWeight - minWeight || 1;
                const relativeWeight = (keyword.weight - minWeight) / weightRange;
                const fontSize = 0.9 + relativeWeight * 0.9;
                const opacity = 0.6 + relativeWeight * 0.4;
                const position = keywordPositions[index];

                return (
                  <span
                    key={keyword.word}
                    className={`absolute font-semibold whitespace-nowrap pointer-events-none ${typeColorMap[keyword.dominantType]}`}
                    style={{
                      top: position.top,
                      left: position.left,
                      transform: `translate(${position.translate})`,
                      fontSize: `${fontSize}rem`,
                      opacity,
                    }}
                  >
                    {keyword.word}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex-1 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold">Community Pulse</h3>
              </div>
              <Badge variant="outline" className="text-xs">
                Reddit discussions
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                  <Thermometer className="w-4 h-4" />
                  Temperature
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-semibold">{temperature}</span>
                  <span className="text-xs text-muted-foreground mb-1">/100</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {temperature > 60 ? "Warm, optimistic mood" : temperature < 40 ? "Cooler, concern-led" : "Balanced conversations"}
                </p>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-500/5 border border-sky-500/20 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-sky-600 dark:text-sky-300">
                  <Activity className="w-4 h-4" />
                  Signal Strength
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-semibold">{insights.length}</span>
                  <span className="ml-1 text-xs text-muted-foreground">insights</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Mix of {typeLabelMap["sentiment"]}, {typeLabelMap["concern"]} &amp; {typeLabelMap["validation"]}
                </p>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-300">
                  <Radio className="w-4 h-4" />
                  Confidence
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-semibold">{confidence ?? "--"}</span>
                  <span className="text-xs text-muted-foreground mb-1">score</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Averaged from Reddit analyst confidence
                </p>
              </div>
            </div>

            {latest && (
              <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-[0.2em]">
                  Latest discussion
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                  "{latest.content}"
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    r/{latest.source_identifier}
                  </Badge>
                  <span>•</span>
                  <span>{new Date(latest.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            )}

            {sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="uppercase tracking-[0.2em] text-[10px]">Active subreddits</span>
                {sources.map((source) => (
                  <Badge key={source} variant="outline" className="text-xs font-medium">
                    r/{source}
                  </Badge>
                ))}
              </div>
            )}

            {lastUpdated && (
              <p className="text-[11px] text-muted-foreground/80">
                Updated {new Date(lastUpdated).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
