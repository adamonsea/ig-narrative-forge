import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Landmark, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp } from 'lucide-react';
import { ParliamentaryDigestVote } from '@/hooks/useParliamentaryDigestCards';

interface ParliamentaryDigestCardProps {
  votes: ParliamentaryDigestVote[];
  topicSlug?: string;
}

const getPartyColor = (party: string | null): string => {
  const colors: Record<string, string> = {
    'Labour': 'bg-red-500',
    'Conservative': 'bg-blue-600',
    'Liberal Democrat': 'bg-amber-500',
    'Green': 'bg-green-600',
    'SNP': 'bg-yellow-400',
    'Plaid Cymru': 'bg-emerald-600',
  };
  return colors[party || ''] || 'bg-muted';
};

const getVoteIcon = (direction: string | null) => {
  switch (direction?.toLowerCase()) {
    case 'aye':
      return <ThumbsUp className="w-3.5 h-3.5 text-green-500" />;
    case 'no':
      return <ThumbsDown className="w-3.5 h-3.5 text-red-500" />;
    default:
      return null;
  }
};

export const ParliamentaryDigestCard = ({ votes, topicSlug }: ParliamentaryDigestCardProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!votes || votes.length === 0) return null;

  const rebellionCount = votes.filter(v => v.is_rebellion).length;
  const mpNames = [...new Set(votes.map(v => v.mp_name).filter(Boolean))];
  const mpLabel = mpNames.length === 1 ? mpNames[0] : `${mpNames.length} MPs`;

  // Show top 3 by default, all when expanded
  const visibleVotes = expanded ? votes : votes.slice(0, 3);
  const hasMore = votes.length > 3;

  // Date range
  const dates = votes.map(v => v.vote_date).filter(Boolean).sort();
  const dateRange = dates.length > 0 
    ? `${format(new Date(dates[0]!), 'MMM d')} – ${format(new Date(dates[dates.length - 1]!), 'MMM d')}`
    : 'This Week';

  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">This Week in Parliament</span>
          </div>
          <span className="text-xs text-muted-foreground">{dateRange}</span>
        </div>
        {/* Summary line */}
        <p className="text-xs text-muted-foreground mt-1">
          {mpLabel} voted {votes.length} time{votes.length !== 1 ? 's' : ''} this week.
          {rebellionCount > 0 && (
            <span className="text-red-500 font-medium"> {rebellionCount} rebellion{rebellionCount !== 1 ? 's' : ''}.</span>
          )}
        </p>
      </div>

      <CardContent className="p-0">
        {/* Vote list */}
        <div className="divide-y divide-border">
          {visibleVotes.map((vote) => (
            <div key={vote.id} className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                {/* Party bar */}
                <div className={`w-1 min-h-[32px] rounded-full shrink-0 mt-0.5 ${getPartyColor(vote.party)}`} />
                
                <div className="flex-1 min-w-0">
                  {/* Title + vote direction */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium text-foreground line-clamp-2 flex-1">
                      {vote.vote_title || 'Parliamentary Vote'}
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      {getVoteIcon(vote.vote_direction)}
                      <span className="text-[10px] font-medium uppercase text-muted-foreground">
                        {vote.vote_direction}
                      </span>
                    </div>
                  </div>
                  
                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{vote.mp_name}</span>
                    {vote.vote_date && (
                      <span className="text-xs text-muted-foreground">
                        · {format(new Date(vote.vote_date), 'MMM d')}
                      </span>
                    )}
                    {vote.vote_category && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {vote.vote_category}
                      </Badge>
                    )}
                    {vote.is_rebellion && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        🔥 Rebellion
                      </Badge>
                    )}
                    {vote.vote_url && (
                      <a
                        href={vote.vote_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 ml-auto"
                      >
                        Details
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Expand/collapse */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-border bg-muted/30 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
            ) : (
              <>See all {votes.length} votes <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
};
