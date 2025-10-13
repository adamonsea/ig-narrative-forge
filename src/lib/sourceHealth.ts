export type SourceHealthLevel = 'healthy' | 'watch' | 'failing' | 'offline';

export interface SourceHealthSnapshot {
  isActive: boolean | null;
  consecutiveFailures?: number | null;
  lastFailureAt?: string | null;
  lastFailureReason?: string | null;
  lastSuccessfulScrape?: string | null;
  lastScrapedAt?: string | null;
}

export interface SourceHealthStatus {
  level: SourceHealthLevel;
  label: string;
  summary: string;
  details: string[];
  nextSteps: string;
}

const MS_IN_HOUR = 1000 * 60 * 60;

const hoursSince = (timestamp?: string | null) => {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / MS_IN_HOUR);
};

const describeRecency = (timestamp?: string | null) => {
  const hours = hoursSince(timestamp);
  if (hours === null) return 'never';
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const evaluateSourceHealth = (
  snapshot: SourceHealthSnapshot,
  options: { includeDetails?: boolean } = {}
): SourceHealthStatus => {
  const { includeDetails = true } = options;
  const isActive = snapshot.isActive !== false;
  const consecutiveFailures = snapshot.consecutiveFailures ?? 0;
  const lastFailureReason = snapshot.lastFailureReason?.trim();
  const lastFailureAtLabel = describeRecency(snapshot.lastFailureAt);
  const lastSuccess = snapshot.lastSuccessfulScrape || snapshot.lastScrapedAt;
  const hoursSinceSuccess = hoursSince(lastSuccess);
  const isStale = hoursSinceSuccess !== null && hoursSinceSuccess > 2 * 24;

  const details: string[] = [];
  if (includeDetails && consecutiveFailures > 0) {
    details.push(`${consecutiveFailures} consecutive failure${consecutiveFailures === 1 ? '' : 's'}` +
      (snapshot.lastFailureAt ? ` • last ${lastFailureAtLabel}` : ''));
  }

  if (includeDetails && isStale) {
    details.push(`No success in ${Math.floor((hoursSinceSuccess || 0) / 24)}d`);
  }

  if (includeDetails && !lastSuccess) {
    details.push('No successful scrape recorded');
  }

  if (includeDetails && lastFailureReason) {
    details.push(lastFailureReason);
  }

  let level: SourceHealthLevel = 'healthy';
  let label = 'Healthy';
  let summary = 'Working normally';
  let nextSteps = 'No action needed.';

  if (!isActive) {
    level = 'offline';
    label = 'Offline';
    summary = 'Source is disabled.';
    nextSteps = 'Reactivate once the issue is resolved.';
    if (includeDetails && !lastFailureReason && snapshot.lastFailureAt) {
      details.push(`Disabled ${lastFailureAtLabel}`);
    }
  } else if (consecutiveFailures >= 3) {
    level = 'failing';
    label = 'Failing';
    summary = 'Scraper is failing repeatedly.';
    nextSteps = 'Investigate and retry manually.';
  } else if (consecutiveFailures === 2) {
    level = 'failing';
    label = 'At risk';
    summary = 'Two failures in a row.';
    nextSteps = 'Schedule a manual check soon.';
  } else if (consecutiveFailures === 1 || isStale) {
    level = 'watch';
    label = 'Watch';
    summary = consecutiveFailures === 1 ? 'Recent failure detected.' : 'Scrapes look stale.';
    nextSteps = consecutiveFailures === 1
      ? 'Keep an eye on the next run.'
      : 'Trigger a manual scrape to confirm availability.';
  }

  if (includeDetails && details.length === 0) {
    details.push(isActive ? `Last success ${describeRecency(lastSuccess)}` : 'Awaiting reactivation');
  }

  return {
    level,
    label,
    summary,
    details: includeDetails ? details : [],
    nextSteps
  };
};

type HealthCounts = Record<SourceHealthLevel, number>;

export const summarizeSourceHealth = (snapshots: SourceHealthSnapshot[]) => {
  return snapshots.reduce<{ counts: HealthCounts; unhealthy: { status: SourceHealthStatus; snapshot: SourceHealthSnapshot }[] }>(
    (acc, snapshot) => {
      const status = evaluateSourceHealth(snapshot);
      acc.counts[status.level] += 1;
      if (status.level !== 'healthy') {
        acc.unhealthy.push({ status, snapshot });
      }
      return acc;
    },
    { counts: { healthy: 0, watch: 0, failing: 0, offline: 0 }, unhealthy: [] }
  );
};
