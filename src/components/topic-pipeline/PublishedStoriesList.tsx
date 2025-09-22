import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLink, Archive, RotateCcw, Eye, Trash2, Save } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { CreditService } from "@/lib/creditService";
import { ImageModelSelector, ImageModel } from "@/components/ImageModelSelector";

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  word_count?: number;
  alt_text?: string;
  visual_prompt?: string;
}

interface PublishedStory {
  id: string;
  title?: string; // Make optional to match MultiTenantStory
  headline?: string; // Keep headline for compatibility  
  summary?: string;
  author?: string;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  slides: Slide[];
  article_id?: string;
  topic_article_id?: string;
  story_type?: 'legacy' | 'multi_tenant';
  cover_illustration_url?: string | null;
  cover_illustration_prompt?: string | null;
  illustration_generated_at?: string | null;
}

interface PublishedStoriesListProps {
  stories: PublishedStory[];
  onArchive: (storyId: string, title: string) => void;
  onReturnToReview: (storyId: string) => void;
  onDelete: (storyId: string, title: string) => void;
  onViewStory: (story: PublishedStory) => void;
  onRefresh: () => void;
  loading?: boolean;
}

export const PublishedStoriesList: React.FC<PublishedStoriesListProps> = ({
  stories,
  onArchive,
  onReturnToReview,
  onDelete,
  onViewStory,
  onRefresh,
  loading = false
}) => {
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveSlide = async (slideId: string) => {
    const content = edits[slideId];
    if (content === undefined) return;
    setSaving(prev => new Set([...prev, slideId]));
    try {
      const { error } = await supabase
        .from('slides')
        .update({ content })
        .eq('id', slideId);
      if (error) throw error;
      toast({ title: 'Slide saved', description: 'Changes have been saved.' });
      setSaving(prev => { const n = new Set(prev); n.delete(slideId); return n; });
    } catch (e) {
      console.error('Error saving slide', e);
      toast({ title: 'Save failed', description: 'Could not save slide', variant: 'destructive' });
      setSaving(prev => { const n = new Set(prev); n.delete(slideId); return n; });
    }
  };

  const saveAllForStory = async (storyId: string, slides: Slide[]) => {
    const toSave = slides.filter(s => edits[s.id] !== undefined);
    if (toSave.length === 0) return;
    try {
      await Promise.all(
        toSave.map(s =>
          supabase.from('slides').update({ content: edits[s.id] as string }).eq('id', s.id)
        )
      );
      toast({ title: 'Slides saved', description: `${toSave.length} slide(s) updated.` });
    } catch (e) {
      console.error('Error saving slides', e);
      toast({ title: 'Save failed', description: 'Could not save slides', variant: 'destructive' });
    }
  };

  const handleGenerateIllustration = async (story: PublishedStory, model: ImageModel) => {
    if (generatingIllustrations.has(story.id)) return;
    
    // Check credits (bypass for super admin)
    if (!isSuperAdmin && (!credits || credits.credits_balance < model.credits)) {
      toast({
        title: 'Insufficient Credits',
        description: `You need ${model.credits} credits to generate with ${model.name}.`,
        variant: 'destructive',
      });
      return;
    }

    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));

    try {
      const result = await CreditService.generateStoryIllustration(story.id, model.id);
      
      if (result.success) {
        toast({
          title: story.cover_illustration_url ? 'Illustration Regenerated Successfully' : 'Illustration Generated Successfully',
          description: `Used ${result.credits_used} credits with ${model.name}. New balance: ${result.new_balance}`,
        });
        
        // Refresh stories to show the new illustration
        onRefresh();
      } else {
        toast({
          title: 'Generation Failed',
          description: result.error || 'Failed to generate illustration',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error generating illustration:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate story illustration',
        variant: 'destructive',
      });
    } finally {
      setGeneratingIllustrations(prev => {
        const next = new Set(prev);
        next.delete(story.id);
        return next;
      });
    }
  };

  const handleDeleteIllustration = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-illustration', {
        body: { storyId }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: 'Illustration Deleted',
          description: 'Cover illustration has been removed successfully.',
        });
        
        setTimeout(() => {
          onRefresh();
        }, 500);
      } else {
        throw new Error(data?.error || 'Failed to delete illustration');
      }
    } catch (error) {
      console.error('Error deleting illustration:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete illustration',
        variant: 'destructive',
      });
    }
  };
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No Published Stories</h3>
        <p className="mb-4 text-muted-foreground">
          Published stories will appear here when approved from arrivals.
        </p>
        <Button variant="outline" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  const getStatusColor = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'default';
    if (story.status === 'ready') return 'secondary';
    return 'outline';
  };

  const getStatusLabel = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'Live';
    if (story.status === 'ready') return 'Ready';
    return 'Draft';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {stories.length} published {stories.length === 1 ? 'story' : 'stories'}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {stories.map((story) => (
        <Card key={story.id} className="relative">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base font-medium leading-tight mb-2">
                  {story.title || story.headline}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={getStatusColor(story)} className="text-xs">
                    {getStatusLabel(story)}
                  </Badge>
                  {story.author && (
                    <>
                      <span>•</span>
                      <span>{story.author}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {story.summary && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {story.summary}
              </p>
            )}

            <Separator className="my-4" />

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleExpanded(story.id)}
                className="h-8"
              >
                <Eye className="mr-1 h-3 w-3" />
                {expanded.has(story.id) ? 'Hide' : 'View'}
              </Button>

              {/* Cover Generation Button */}
              <ImageModelSelector
                onModelSelect={(model) => handleGenerateIllustration(story, model)}
                isGenerating={generatingIllustrations.has(story.id)}
                hasExistingImage={!!story.cover_illustration_url}
                size="sm"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => onArchive(story.id, story.title || story.headline || 'Untitled')}
                className="h-8"
              >
                <Archive className="mr-1 h-3 w-3" />
                Archive
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onReturnToReview(story.id)}
                className="h-8"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Return
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(story.id, story.title || story.headline || 'Untitled')}
                className="h-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>

              {story.is_published && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-8 ml-auto"
                >
                  <a 
                    href={`/story/${story.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>

            {/* Expandable Slide Content */}
            {expanded.has(story.id) && (
              <div className="mt-4 border-t pt-4">
                {/* Show cover illustration if exists */}
                {story.cover_illustration_url && (
                  <div className="mb-4 bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Cover Illustration</h4>
                      <div className="flex gap-2">
                        <ImageModelSelector
                          onModelSelect={(model) => handleGenerateIllustration(story, model)}
                          isGenerating={generatingIllustrations.has(story.id)}
                          hasExistingImage={false}
                          size="sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteIllustration(story.id)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="relative w-full max-w-md">
                      <img
                        src={story.cover_illustration_url}
                        alt={`Cover illustration for ${story.title || story.headline}`}
                        className="w-full h-48 object-contain bg-white rounded-lg border"
                        style={{ imageRendering: 'crisp-edges' }}
                      />
                      <div className="mt-2 text-xs text-muted-foreground">
                        Generated: {story.illustration_generated_at ? 
                          new Date(story.illustration_generated_at).toLocaleString() : 
                          'Unknown'
                        }
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Slides ({story.slides.length})</h4>
                  {story.slides.map((slide, index) => (
                    <div key={slide.id} className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-muted-foreground">
                          Slide {slide.slide_number || index + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {slide.word_count || 0} words
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="bg-background rounded p-3">
                          {edits[slide.id] !== undefined ? (
                            <Textarea
                              value={edits[slide.id]}
                              onChange={(e) => setEdits(prev => ({ ...prev, [slide.id]: e.target.value }))}
                              className="min-h-[120px] border-0 bg-transparent resize-none focus-visible:ring-0"
                              placeholder="Slide content..."
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {slide.content}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {edits[slide.id] !== undefined ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => saveSlide(slide.id)}
                                disabled={saving.has(slide.id)}
                              >
                                <Save className="mr-1 h-3 w-3" />
                                {saving.has(slide.id) ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEdits(prev => {
                                  const next = { ...prev };
                                  delete next[slide.id];
                                  return next;
                                })}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEdits(prev => ({ ...prev, [slide.id]: slide.content }))}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {story.slides.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveAllForStory(story.id, story.slides)}
                    className="mt-3"
                  >
                    <Save className="mr-1 h-3 w-3" />
                    Save All Changes
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};