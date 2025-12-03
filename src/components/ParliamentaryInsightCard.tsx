import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ExternalLink, Landmark, ThumbsUp, ThumbsDown, MinusCircle } from 'lucide-react';
import { ParliamentaryVote } from '@/hooks/useParliamentaryInsightCards';

interface ParliamentaryInsightCardProps {
  votes: ParliamentaryVote[];
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
      return <ThumbsUp className="w-5 h-5 text-green-500" />;
    case 'no':
      return <ThumbsDown className="w-5 h-5 text-red-500" />;
    default:
      return <MinusCircle className="w-5 h-5 text-muted-foreground" />;
  }
};

export const ParliamentaryInsightCard = ({ votes, topicSlug }: ParliamentaryInsightCardProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!votes || votes.length === 0) return null;

  const vote = votes[currentIndex];
  const hasMultiple = votes.length > 1;

  const handlePrev = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : votes.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev < votes.length - 1 ? prev + 1 : 0));
  };

  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Parliamentary Activity</span>
        </div>
        {hasMultiple && (
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} of {votes.length}
          </span>
        )}
      </div>

      <CardContent className="p-0">
        {/* Vote Content */}
        <div className="p-4 space-y-4">
          {/* MP Info */}
          <div className="flex items-start gap-3">
            <div className={`w-2 h-12 rounded-full ${getPartyColor(vote.party)}`} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{vote.mp_name || 'MP'}</h3>
              <p className="text-sm text-muted-foreground">{vote.party} · {vote.constituency}</p>
            </div>
            <div className="flex items-center gap-2">
              {getVoteIcon(vote.vote_direction)}
              <span className="text-sm font-medium uppercase">{vote.vote_direction || 'Unknown'}</span>
            </div>
          </div>

          {/* Vote Title */}
          <div>
            <h4 className="font-medium text-foreground leading-snug line-clamp-2">
              {vote.vote_title || 'Parliamentary Vote'}
            </h4>
            {vote.vote_date && (
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(vote.vote_date), 'MMMM d, yyyy')}
              </p>
            )}
          </div>

          {/* Vote Result */}
          <div className="flex items-center gap-4 text-sm">
            <Badge variant={vote.vote_outcome === 'Passed' ? 'default' : 'secondary'}>
              {vote.vote_outcome || 'Pending'}
            </Badge>
            <span className="text-muted-foreground">
              Ayes {vote.aye_count ?? 0} : Noes {vote.no_count ?? 0}
            </span>
            {vote.is_rebellion && (
              <Badge variant="destructive" className="text-xs">
                🔥 Rebellion
              </Badge>
            )}
          </div>

          {/* Local Impact */}
          {vote.local_impact_summary && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {vote.local_impact_summary}
            </p>
          )}

          {/* Link */}
          {vote.vote_url && (
            <a
              href={vote.vote_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View on Parliament.uk
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Navigation */}
        {hasMultiple && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            
            {/* Dots */}
            <div className="flex gap-1">
              {votes.slice(0, 5).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                />
              ))}
              {votes.length > 5 && (
                <span className="text-xs text-muted-foreground ml-1">+{votes.length - 5}</span>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
