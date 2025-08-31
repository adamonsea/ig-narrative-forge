import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, CheckCircle, Eye, Edit3, Trash2, ExternalLink, RotateCcw, Loader2 } from "lucide-react";
import { CarouselGenerationButton } from "../CarouselGenerationButton";

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface StoryArticle {
  id?: string;
  title: string;
  author?: string;
  source_url: string;
  region?: string;
  published_at?: string | null;
  word_count?: number | null;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
  articles?: StoryArticle;
  is_published?: boolean;
}

interface StoriesListProps {
  stories: Story[];
  expandedStories: Set<string>;
  processingApproval: Set<string>;
  processingRejection: Set<string>;
  deletingStories: Set<string>;
  publishingStories: Set<string>;
  onToggleExpanded: (storyId: string) => void;
  onApprove: (storyId: string) => void;
  onReject: (storyId: string) => void;
  onDelete: (storyId: string, storyTitle: string) => void;
  onReturnToReview: (storyId: string) => void;
  onEditSlide: (slide: Slide) => void;
  onViewStory: (story: Story) => void;
}

export const StoriesList: React.FC<StoriesListProps> = ({
  stories,
  expandedStories,
  processingApproval,
  processingRejection,
  deletingStories,
  publishingStories,
  onToggleExpanded,
  onApprove,
  onReject,
  onDelete,
  onReturnToReview,
  onEditSlide,
  onViewStory
}) => {
  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    if (slideNumber === 1) return "text-blue-600"; // Title slide
    if (wordCount > 25) return "text-red-600"; // Too long
    if (wordCount < 15) return "text-yellow-600"; // Potentially too short
    return "text-green-600"; // Good length
  };

  const getWordCountBadge = (wordCount: number, slideNumber: number) => {
    if (slideNumber === 1) return "Title";
    if (wordCount > 25) return "Long";
    if (wordCount < 15) return "Short";
    return "Good";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Ready</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (stories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Stories Ready</CardTitle>
          <CardDescription>
            Generated stories will appear here for review and approval.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {stories.map((story) => {
        const article = story.article || story.articles;
        const isExpanded = expandedStories.has(story.id);

        return (
          <Card key={story.id} className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="mobile-card-header justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleExpanded(story.id)}
                      className="p-1 h-auto"
                    >
                      {isExpanded ? 
                        <ChevronDown className="w-4 h-4" /> : 
                        <ChevronRight className="w-4 h-4" />
                      }
                    </Button>
                    <CardTitle className="text-base line-clamp-2">
                      {story.title}
                    </CardTitle>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:gap-4 mobile-text-wrap text-muted-foreground flex-wrap">
                    {getStatusBadge(story.status)}
                    <span>{story.slides?.length || 0} slides</span>
                    <span>{article?.word_count || 0} words</span>
                    <span>
                      {new Date(story.created_at).toLocaleDateString()}
                    </span>
                    {article?.author && (
                      <span>by {article.author}</span>
                    )}
                  </div>
                </div>
                
                <div className="mobile-header-actions">
                  <div className="mobile-button-group">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewStory(story)}
                      className="w-full sm:w-auto"
                    >
                      <Eye className="w-4 h-4 sm:mr-0" />
                      <span className="ml-2 sm:hidden">View</span>
                    </Button>
                    {article?.source_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(article.source_url, '_blank')}
                        className="w-full sm:w-auto"
                      >
                        <ExternalLink className="w-4 h-4 sm:mr-0" />
                        <span className="ml-2 sm:hidden">Source</span>
                      </Button>
                    )}
                  </div>
                  
                  <div className="mobile-button-group">
                    {story.status === 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onReturnToReview(story.id)}
                        className="w-full sm:w-auto"
                      >
                        <RotateCcw className="w-4 h-4 sm:mr-0" />
                        <span className="ml-2 sm:hidden">Return</span>
                      </Button>
                    )}
                    
                    {story.status === 'draft' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => onApprove(story.id)}
                          disabled={processingApproval.has(story.id)}
                          className="w-full sm:w-auto"
                        >
                          {processingApproval.has(story.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 sm:mr-0" />
                              <span className="ml-2 sm:hidden">Approve</span>
                            </>
                          )}
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReject(story.id)}
                          disabled={processingRejection.has(story.id)}
                          className="w-full sm:w-auto"
                        >
                          {processingRejection.has(story.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 sm:mr-0" />
                              <span className="ml-2 sm:hidden">Reject</span>
                            </>
                          )}
                        </Button>
                      </>
                    )}
                    
                    {story.status === 'ready' && (
                      <CarouselGenerationButton 
                        storyId={story.id}
                        storyTitle={story.title}
                      />
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            {isExpanded && story.slides && story.slides.length > 0 && (
              <CardContent className="pt-0">
                <div className="space-y-3 border-t pt-4">
                  {story.slides.map((slide) => (
                    <div
                      key={slide.id}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                        {slide.slide_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed mb-2">
                          {slide.content}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={getWordCountColor(slide.word_count, slide.slide_number)}
                          >
                            {getWordCountBadge(slide.word_count, slide.slide_number)} ({slide.word_count} words)
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEditSlide(slide)}
                        className="flex-shrink-0"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};