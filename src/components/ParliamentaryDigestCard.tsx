import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ExternalLink, Landmark, ThumbsUp, ThumbsDown, ScrollText } from 'lucide-react';
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
      return <ThumbsUp className="w-4 h-4 text-green-500" />;
    case 'no':
      return <ThumbsDown className="w-4 h-4 text-red-500" />;
    default:
      return null;
  }
};

const getCategoryColor = (category: string | null): string => {
  const colors: Record<string, string> = {
    'Economy': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    'NHS': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'Education': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    'Housing': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    'Environment': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Transport': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    'Defence': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
    'Justice': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    'Immigration': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    'Welfare': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  };
  return colors[category || ''] || 'bg-muted text-muted-foreground';
};

export const ParliamentaryDigestCard = ({ votes, topicSlug }: ParliamentaryDigestCardProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const votesPerPage = 5;

  if (!votes || votes.length === 0) return null;

  const totalPages = Math.ceil(votes.length / votesPerPage);
  const startIdx = currentPage * votesPerPage;
  const visibleVotes = votes.slice(startIdx, startIdx + votesPerPage);
  const mpName = votes[0]?.mp_name || 'Your MP';

  const handlePrev = () => {
    setCurrentPage(prev => (prev > 0 ? prev - 1 : totalPages - 1));
  };

  const handleNext = () => {
    setCurrentPage(prev => (prev < totalPages - 1 ? prev + 1 : 0));
  };

  // Get unique date range
  const dates = votes.map(v => v.vote_date).filter(Boolean).sort();
  const dateRange = dates.length > 0 
    ? `${format(new Date(dates[0]!), 'MMM d')} - ${format(new Date(dates[dates.length - 1]!), 'MMM d')}`
    : 'This Week';

  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Weekly Voting Digest</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {votes.length} votes
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {mpName}'s recent votes · {dateRange}
        </p>
      </div>

      <CardContent className="p-0">
        {/* Vote List */}
        <div className="divide-y divide-border">
          {visibleVotes.map((vote) => (
            <div key={vote.id} className="p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start gap-3">
                {/* Party indicator */}
                <div className={`w-1 h-full min-h-[40px] rounded-full ${getPartyColor(vote.party)}`} />
                
                <div className="flex-1 min-w-0">
                  {/* Title and vote direction */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium text-foreground line-clamp-2 flex-1">
                      {vote.vote_title || 'Parliamentary Vote'}
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      {getVoteIcon(vote.vote_direction)}
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {vote.vote_direction}
                      </span>
                    </div>
                  </div>
                  
                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {vote.vote_date && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(vote.vote_date), 'MMM d')}
                      </span>
                    )}
                    {vote.vote_category && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryColor(vote.vote_category)}`}>
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
                        className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="gap-1 h-8"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            
            {/* Page dots */}
            <div className="flex gap-1">
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx)}
                  className={`w-2 h-2 rounded-full transition-colors p-[19px] -m-[19px] ${
                    idx === currentPage ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                  style={{ width: '10px', height: '10px', padding: 0, margin: '0 2px' }}
                />
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="gap-1 h-8"
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
