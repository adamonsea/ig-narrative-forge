import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, MessageSquare, Link2 } from 'lucide-react';
import { format } from 'date-fns';

interface ParliamentaryDebateCardProps {
  mpName: string;
  constituency: string;
  party: string;
  debateTitle: string;
  debateExcerpt: string;
  debateDate: string;
  hansardUrl?: string;
  regionMentioned?: string;
  landmarkMentioned?: string;
  relevanceScore: number;
  storyId?: string;
  topicId?: string;
}

export const ParliamentaryDebateCard = ({
  mpName,
  constituency,
  party,
  debateTitle,
  debateExcerpt,
  debateDate,
  hansardUrl,
  regionMentioned,
  landmarkMentioned,
  relevanceScore,
  storyId,
  topicId
}: ParliamentaryDebateCardProps) => {
  return (
    <div className="flex justify-center px-1 md:px-4 mb-4">
      <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl border-l-4 border-l-blue-500 bg-blue-50">
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Parliamentary Debate
                  </span>
                </div>
                <h3 className="font-bold text-lg leading-tight line-clamp-2">
                  {debateTitle}
                </h3>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {format(new Date(debateDate), 'MMM d')}
              </Badge>
            </div>

            {/* MP Info */}
            <div className="py-2 border-y border-gray-200">
              <p className="font-semibold text-base">{mpName}</p>
              <p className="text-sm text-muted-foreground">{constituency} • {party}</p>
            </div>

            {/* Debate excerpt */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">From the debate:</p>
              <blockquote className="text-sm italic border-l-2 border-blue-300 pl-3 py-1">
                "{debateExcerpt}"
              </blockquote>
            </div>

            {/* Mentions */}
            {(regionMentioned || landmarkMentioned) && (
              <div className="text-sm space-y-1">
                {regionMentioned && (
                  <div>
                    <span className="text-muted-foreground">Region: </span>
                    <span className="font-medium">{regionMentioned}</span>
                  </div>
                )}
                {landmarkMentioned && (
                  <div>
                    <span className="text-muted-foreground">Landmark: </span>
                    <span className="font-medium">{landmarkMentioned}</span>
                  </div>
                )}
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
                {hansardUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => window.open(hansardUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View on Hansard
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