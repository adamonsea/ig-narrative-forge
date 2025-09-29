import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, ThumbsUp, ThumbsDown, Minus, Link2 } from 'lucide-react';
import { format } from 'date-fns';

interface ParliamentaryVoteCardProps {
  mpName: string;
  constituency: string;
  party: string;
  voteTitle: string;
  voteDirection: 'aye' | 'no' | 'abstain';
  voteDate: string;
  voteUrl?: string;
  regionMentioned?: string;
  relevanceScore: number;
  storyId?: string;
  topicId?: string;
}

export const ParliamentaryVoteCard = ({
  mpName,
  constituency,
  party,
  voteTitle,
  voteDirection,
  voteDate,
  voteUrl,
  regionMentioned,
  relevanceScore,
  storyId,
  topicId
}: ParliamentaryVoteCardProps) => {
  const getVoteIcon = () => {
    switch (voteDirection) {
      case 'aye': return <ThumbsUp className="w-4 h-4 text-green-600" />;
      case 'no': return <ThumbsDown className="w-4 h-4 text-red-600" />;
      case 'abstain': return <Minus className="w-4 h-4 text-gray-600" />;
      default: return null;
    }
  };

  const getVoteColor = () => {
    switch (voteDirection) {
      case 'aye': return 'border-l-green-500 bg-green-50';
      case 'no': return 'border-l-red-500 bg-red-50';
      case 'abstain': return 'border-l-gray-500 bg-gray-50';
      default: return 'border-l-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="flex justify-center px-1 md:px-4 mb-4">
      <Card className={`w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl border-l-4 ${getVoteColor()}`}>
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getVoteIcon()}
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Parliamentary Vote
                  </span>
                </div>
                <h3 className="font-bold text-lg leading-tight line-clamp-2">
                  {voteTitle}
                </h3>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {format(new Date(voteDate), 'MMM d')}
              </Badge>
            </div>

            {/* MP Info */}
            <div className="space-y-2 py-2 border-y border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-base">{mpName}</p>
                  <p className="text-sm text-muted-foreground">{constituency} • {party}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Voted</p>
                  <p className="font-semibold capitalize text-sm">{voteDirection}</p>
                </div>
              </div>
            </div>

            {/* Region mention if relevant */}
            {regionMentioned && (
              <div className="text-sm">
                <span className="text-muted-foreground">Mentions: </span>
                <span className="font-medium">{regionMentioned}</span>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
              <div className="text-xs text-muted-foreground">
                Relevance: {relevanceScore}%
              </div>
              <div className="flex gap-2 flex-wrap">
                {storyId && topicId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => window.open(`/@${topicId}/${storyId}`, '_blank', 'noopener,noreferrer')}
                  >
                    <Link2 className="w-3 h-3 mr-1" />
                    View Story
                  </Button>
                )}
                {voteUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => window.open(voteUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View on Parliament.uk
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};