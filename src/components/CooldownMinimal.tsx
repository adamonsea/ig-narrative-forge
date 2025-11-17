import { CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CooldownMinimalProps {
  lastScrapedAt: string | null;
  scrapeFrequencyHours: number | null;
  topicLastRunAt?: string | null;
}

export const CooldownMinimal = ({
  lastScrapedAt,
  scrapeFrequencyHours,
  topicLastRunAt
}: CooldownMinimalProps) => {
  
  // Use the most recent timestamp between manual and automated scrapes
  const effectiveLastScrape = (() => {
    if (topicLastRunAt && lastScrapedAt) {
      const topicTime = new Date(topicLastRunAt).getTime();
      const manualTime = new Date(lastScrapedAt).getTime();
      return new Date(Math.max(topicTime, manualTime));
    }
    if (topicLastRunAt) return new Date(topicLastRunAt);
    if (lastScrapedAt) return new Date(lastScrapedAt);
    return null;
  })();
  
  if (!effectiveLastScrape || !scrapeFrequencyHours) {
    return (
      <Badge variant="outline" className="gap-1 text-xs font-normal">
        <CheckCircle className="w-3 h-3" />
        Ready
      </Badge>
    );
  }
  
  const lastScraped = effectiveLastScrape.getTime();
  const cooldownMs = scrapeFrequencyHours * 60 * 60 * 1000;
  const nextAvailable = lastScraped + cooldownMs;
  const isOnCooldown = Date.now() < nextAvailable;
  
  if (!isOnCooldown) {
    return (
      <Badge variant="outline" className="gap-1 text-xs font-normal">
        <CheckCircle className="w-3 h-3" />
        Ready
      </Badge>
    );
  }
  
  const timeRemaining = nextAvailable - Date.now();
  const hoursRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60));
  
  return (
    <Badge variant="secondary" className="gap-1 text-xs font-normal">
      <Clock className="w-3 h-3" />
      {hoursRemaining}h
    </Badge>
  );
};
