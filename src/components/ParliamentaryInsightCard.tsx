import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Landmark, ThumbsUp, ThumbsDown, MinusCircle, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
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
  const [currentVoteIndex, setCurrentVoteIndex] = useState(0);
  // Each vote has 3 mini-slides: 0=title+MP, 1=result+tally, 2=impact+link
  const [miniSlide, setMiniSlide] = useState(0);

  if (!votes || votes.length === 0) return null;

  const vote = votes[currentVoteIndex];
  const hasMultipleVotes = votes.length > 1;

  const handlePrevVote = () => {
    setCurrentVoteIndex(prev => (prev > 0 ? prev - 1 : votes.length - 1));
    setMiniSlide(0);
  };

  const handleNextVote = () => {
    setCurrentVoteIndex(prev => (prev < votes.length - 1 ? prev + 1 : 0));
    setMiniSlide(0);
  };

  const handleShare = async () => {
    const text = `${vote.mp_name} voted ${vote.vote_direction?.toUpperCase()} on: ${vote.vote_title}`;
    const url = vote.vote_url || '';
    
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Parliamentary Vote', text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
    } catch {}
  };

  // Mini-slide content
  const renderMiniSlide = () => {
    switch (miniSlide) {
      // Slide 1: "How did your MP vote?" + title + MP info
      case 0:
        return (
          <div className="space-y-3">
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
            <h4 className="font-medium text-foreground leading-snug line-clamp-3">
              {vote.vote_title || 'Parliamentary Vote'}
            </h4>
            {vote.vote_date && (
              <p className="text-xs text-muted-foreground">
                {format(new Date(vote.vote_date), 'MMMM d, yyyy')}
              </p>
            )}
          </div>
        );

      // Slide 2: Result + tally
      case 1:
        return (
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-2">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              Vote Outcome
            </p>
            <div className="text-4xl font-bold">
              {vote.vote_outcome === 'Passed' || vote.vote_outcome === 'passed'
                ? <span className="text-green-600 dark:text-green-400">PASSED</span>
                : <span className="text-red-600 dark:text-red-400">REJECTED</span>
              }
            </div>
            <div className="text-lg text-muted-foreground">
              Ayes {vote.aye_count ?? 0} · Noes {vote.no_count ?? 0}
            </div>
            {vote.is_rebellion && (
              <Badge variant="destructive" className="text-xs">
                🔥 Against party whip
              </Badge>
            )}
          </div>
        );

      // Slide 3: Impact + link
      case 2:
        return (
          <div className="space-y-4">
            {vote.local_impact_summary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Why it matters</p>
                <p className="text-sm text-foreground leading-relaxed">
                  {vote.local_impact_summary}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3">
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
              <Button variant="ghost" size="sm" onClick={handleShare} className="ml-auto gap-1 h-7 text-xs">
                <Share2 className="w-3 h-3" />
                Share
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">How did your MP vote?</span>
        </div>
        {hasMultipleVotes && (
          <span className="text-xs text-muted-foreground">
            {currentVoteIndex + 1} of {votes.length}
          </span>
        )}
      </div>

      <CardContent className="p-0">
        {/* Mini-slide content */}
        <div className="p-4 min-h-[180px]">
          {renderMiniSlide()}
        </div>

        {/* Mini-slide dots + navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
          {/* Vote navigation (prev/next vote) */}
          {hasMultipleVotes ? (
            <Button variant="ghost" size="sm" onClick={handlePrevVote} className="gap-1 h-7 text-xs">
              <ChevronLeft className="w-3 h-3" />
              Prev
            </Button>
          ) : <div />}

          {/* Mini-slide dots */}
          <div className="flex gap-1.5">
            {[0, 1, 2].map(idx => (
              <button
                key={idx}
                onClick={() => setMiniSlide(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === miniSlide ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {hasMultipleVotes ? (
            <Button variant="ghost" size="sm" onClick={handleNextVote} className="gap-1 h-7 text-xs">
              Next
              <ChevronRight className="w-3 h-3" />
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setMiniSlide(prev => (prev < 2 ? prev + 1 : 0))}
              className="gap-1 h-7 text-xs"
            >
              {miniSlide < 2 ? 'More' : 'Back'}
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
