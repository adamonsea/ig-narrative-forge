import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, ArrowLeft, X, Loader2, Plus, Sparkles, CheckCircle, ExternalLink, Settings, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { FeedBuildProgress } from "@/components/FeedBuildProgress";

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: string;
  confidence_score: number;
  rationale: string;
  platform_reliability?: 'high' | 'medium' | 'low';
  // After creation
  source_id?: string;
}

interface StoryPreview {
  id: string;
  title: string;
}

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopicCreated: (topicSlug: string) => void;
}

const EXAMPLE_NAMES = [
  "Eastbourne News",
  "AI & Ethics",
  "Cycling Culture",
  "Brighton Events",
  "Tech Innovation",
];

export const CreateTopicDialog = ({ open, onOpenChange, onTopicCreated }: CreateTopicDialogProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Name
  const [topicName, setTopicName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isValidatingName, setIsValidatingName] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Step 2: Sources (auto-discovered)
  const [sources, setSources] = useState<SourceSuggestion[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [isDiscoveringSources, setIsDiscoveringSources] = useState(false);
  const [addingSource, setAddingSource] = useState<string | null>(null);

  // Step 3: Build progress
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicSlug, setTopicSlug] = useState<string>("");
  const [createdSourceIds, setCreatedSourceIds] = useState<string[]>([]);

  // Step 4: Complete
  const [completedStories, setCompletedStories] = useState<StoryPreview[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);

  // Background data (auto-generated, never shown to user)
  const [autoKeywords, setAutoKeywords] = useState<string[]>([]);
  const [autoDescription, setAutoDescription] = useState("");
  const [autoTopicType, setAutoTopicType] = useState<'regional' | 'keyword'>('keyword');
  const [autoRegion, setAutoRegion] = useState("");

  // Rotate placeholder
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_NAMES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Name validation (debounced)
  useEffect(() => {
    if (!topicName || topicName.length < 3) {
      setNameError(null);
      return;
    }
    const slug = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const timeout = setTimeout(async () => {
      setIsValidatingName(true);
      try {
        const { data } = await supabase
          .from('topics')
          .select('id, name')
          .eq('slug', slug)
          .maybeSingle();
        setNameError(data ? `A feed called "${data.name}" already exists` : null);
      } catch {
        setNameError(null);
      } finally {
        setIsValidatingName(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [topicName]);

  // Auto-detect topic type from name
  useEffect(() => {
    if (!topicName || topicName.length < 3) return;
    const timeout = setTimeout(() => {
      const regionalWords = ['news', 'events', 'local', 'area', 'community'];
      const hasRegional = regionalWords.some(w => topicName.toLowerCase().includes(w));
      if (hasRegional) {
        setAutoTopicType('regional');
        const words = topicName.split(' ');
        const region = words.find(w => !regionalWords.includes(w.toLowerCase()) && w.length > 2);
        if (region) setAutoRegion(region);
      } else {
        setAutoTopicType('keyword');
        setAutoRegion('');
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [topicName]);

  const canProceedStep1 = topicName.length >= 3 && !nameError && !isValidatingName;

  // Step 1 → Step 2: auto-generate keywords + discover sources in parallel
  const handleStep1Continue = async () => {
    if (!canProceedStep1) return;
    setCurrentStep(2);
    
    // Auto-generate description
    const desc = autoTopicType === 'regional'
      ? `Stay updated with the latest news and stories from ${autoRegion || topicName}.`
      : `Curated updates and insights about ${topicName}.`;
    setAutoDescription(desc);

    // Run keyword generation + source discovery in parallel
    setIsDiscoveringSources(true);

    try {
      // Generate keywords silently
      const keywordsPromise = supabase.functions.invoke('auto-generate-topic-keywords', {
        body: {
          topicName,
          description: desc,
          topicType: autoTopicType,
          region: autoRegion || undefined,
          targetCount: 30,
        },
      }).then(({ data }) => {
        if (data?.keywords) {
          const selected = data.keywords
            .filter((k: any) => k.preSelected)
            .map((k: any) => k.keyword);
          setAutoKeywords(selected.length > 0 ? selected : data.keywords.slice(0, 15).map((k: any) => k.keyword));
        }
      }).catch(() => {
        // Fallback: use topic name words as keywords
        setAutoKeywords(topicName.split(' ').filter((w: string) => w.length > 2));
      });

      // Discover sources
      const sourcesPromise = supabase.functions.invoke('suggest-content-sources', {
        body: {
          topicName,
          description: desc,
          keywords: topicName, // Use name initially, keywords may not be ready yet
          topicType: autoTopicType,
          region: autoRegion || undefined,
          enhanced: true,
          focusPlatforms: ['WordPress', 'RSS', 'Substack', 'News'],
          excludeProblematic: true,
        },
      }).then(({ data }) => {
        const suggestions = (data?.suggestions || [])
          .filter((s: SourceSuggestion) => {
            if (s.confidence_score < 60) return false;
            const url = s.url.toLowerCase();
            const blocked = ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'linkedin.com', 'youtube.com', 'medium.com'];
            if (blocked.some(b => url.includes(b))) return false;
            if (s.platform_reliability === 'low') return false;
            return true;
          })
          .sort((a: SourceSuggestion, b: SourceSuggestion) => {
            const score = (s: SourceSuggestion) => {
              let sc = s.confidence_score;
              if (s.platform_reliability === 'high') sc += 25;
              if (s.platform_reliability === 'medium') sc += 15;
              return sc;
            };
            return score(b) - score(a);
          });

        setSources(suggestions);

        // Auto-select top 3 high-confidence sources
        const autoSelect = new Set<string>();
        suggestions.slice(0, 3).forEach((s: SourceSuggestion) => {
          if (s.confidence_score >= 65 || s.platform_reliability === 'high') {
            autoSelect.add(s.url);
          }
        });
        // If less than 3, add more
        if (autoSelect.size < 3) {
          suggestions.slice(0, 5).forEach((s: SourceSuggestion) => autoSelect.add(s.url));
        }
        setSelectedSources(autoSelect);
      });

      await Promise.all([keywordsPromise, sourcesPromise]);
    } catch (error) {
      console.error('Discovery error:', error);
    } finally {
      setIsDiscoveringSources(false);
    }
  };

  const toggleSource = (url: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAllSources = () => {
    setSelectedSources(new Set(sources.map(s => s.url)));
  };

  const getTypeIcon = (type: string) => {
    if (type === 'RSS') return '📡';
    if (type === 'WordPress') return '📝';
    if (type === 'Substack') return '📰';
    if (type === 'News') return '🗞️';
    return '🌐';
  };

  // Step 2 → Step 3: Create topic + sources, then start build
  const handleStep2Continue = async () => {
    if (!user) return;
    setCurrentStep(3);

    try {
      const slug = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      setTopicSlug(slug);

      // Create the topic
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .insert({
          name: topicName,
          slug,
          topic_type: autoTopicType,
          region: autoRegion || null,
          description: autoDescription || null,
          keywords: autoKeywords.length > 0 ? autoKeywords : topicName.split(' ').filter((w: string) => w.length > 2),
          audience_expertise: 'beginner' as any,
          is_active: true,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (topicError) {
        if (topicError.code === '23505') {
          throw new Error(`A feed with this name already exists.`);
        }
        throw topicError;
      }

      setTopicId(topicData.id);

      // Create sources for selected ones
      const selectedSourceList = sources.filter(s => selectedSources.has(s.url));
      const sourceIds: string[] = [];

      for (const source of selectedSourceList) {
        try {
          const domain = new URL(source.url).hostname.replace('www.', '');
          
          // Check if source already exists
          const { data: existing } = await supabase
            .from('content_sources')
            .select('id')
            .or(`feed_url.eq.${source.url},canonical_domain.eq.${domain}`)
            .maybeSingle();

          if (existing) {
            sourceIds.push(existing.id);
          } else {
            let credibility = Math.round(source.confidence_score * 0.8);
            if (source.platform_reliability === 'high') credibility += 15;
            if (source.platform_reliability === 'medium') credibility += 10;
            credibility = Math.min(95, credibility);

            const { data: newSource } = await supabase
              .from('content_sources')
              .insert({
                source_name: source.source_name,
                feed_url: source.url,
                canonical_domain: domain,
                content_type: 'news',
                credibility_score: credibility,
                is_active: true,
                source_type: source.type === 'RSS' ? 'rss' : 'website',
                region: autoTopicType === 'regional' ? autoRegion : null,
              })
              .select('id')
              .single();

            if (newSource) sourceIds.push(newSource.id);
          }
        } catch (e) {
          console.warn('Source creation error:', e);
        }
      }

      setCreatedSourceIds(sourceIds);
    } catch (error) {
      console.error('Topic creation error:', error);
      setBuildError(error instanceof Error ? error.message : 'Failed to create feed');
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create feed",
        variant: "destructive",
      });
    }
  };

  const handleBuildComplete = useCallback((stories: StoryPreview[]) => {
    setCompletedStories(stories);
    setCurrentStep(4);
  }, []);

  const handleBuildError = useCallback((error: string) => {
    setBuildError(error);
    // Still advance to step 4 — feed is created, just may not have stories yet
    setCurrentStep(4);
  }, []);

  const resetForm = () => {
    setCurrentStep(1);
    setTopicName("");
    setNameError(null);
    setIsValidatingName(false);
    setSources([]);
    setSelectedSources(new Set());
    setIsDiscoveringSources(false);
    setTopicId(null);
    setTopicSlug("");
    setCreatedSourceIds([]);
    setCompletedStories([]);
    setBuildError(null);
    setAutoKeywords([]);
    setAutoDescription("");
    setAutoTopicType('keyword');
    setAutoRegion("");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const stepTitles: Record<number, string> = {
    1: "Name your feed",
    2: "Add sources",
    3: "Building your feed",
    4: "Your feed is live!",
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-6 right-6 z-10 p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-muted-foreground" />
          </button>

          <div className="h-full flex flex-col">
            {/* Header with progress (hidden on steps 3-4) */}
            {currentStep <= 2 && (
              <div className="flex-shrink-0 pt-16 pb-8 px-6">
                <div className="flex justify-center gap-2 mb-8">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-500",
                        currentStep === step
                          ? "bg-primary w-12"
                          : currentStep > step
                          ? "bg-primary/40 w-6"
                          : "bg-muted w-6"
                      )}
                    />
                  ))}
                </div>

                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                    {stepTitles[currentStep]}
                  </h1>
                </motion.div>
              </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-y-auto px-6">
              <div className="max-w-lg mx-auto pb-32">
                <AnimatePresence mode="wait">
                  {/* ========= STEP 1: Name ========= */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6 pt-8"
                    >
                      <div className="space-y-3">
                        <div className="relative">
                          <Input
                            value={topicName}
                            onChange={(e) => setTopicName(e.target.value)}
                            placeholder={EXAMPLE_NAMES[placeholderIndex]}
                            className={cn(
                              "text-xl md:text-2xl h-16 text-center font-medium border-2 focus:ring-4 rounded-xl transition-all placeholder:text-muted-foreground/40",
                              nameError
                                ? "border-destructive focus:border-destructive focus:ring-destructive/10"
                                : "border-border focus:border-primary focus:ring-primary/10"
                            )}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && canProceedStep1) handleStep1Continue();
                            }}
                          />
                          {isValidatingName && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        {nameError ? (
                          <p className="text-center text-sm text-destructive animate-fade-in">{nameError}</p>
                        ) : (
                          <p className="text-center text-sm text-muted-foreground">
                            Choose a clear, memorable name for your feed
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ========= STEP 2: Sources ========= */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6 pt-8"
                    >
                      {isDiscoveringSources ? (
                        <div className="flex flex-col items-center justify-center py-16 space-y-6">
                          <Loader2 className="w-10 h-10 animate-spin text-primary" />
                          <div className="text-center space-y-2">
                            <p className="text-lg font-medium">Finding sources for "{topicName}"</p>
                            <p className="text-sm text-muted-foreground">Scanning RSS feeds, WordPress & Substack sites…</p>
                          </div>
                        </div>
                      ) : sources.length > 0 ? (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              <span className="font-semibold text-foreground">{selectedSources.size}</span> of {sources.length} selected
                            </p>
                            <Button variant="ghost" size="sm" onClick={selectAllSources} className="text-xs">
                              Select all
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-2.5 max-h-[45vh] overflow-y-auto py-2">
                            {sources.map((source) => {
                              const isSelected = selectedSources.has(source.url);
                              return (
                                <button
                                  key={source.url}
                                  onClick={() => toggleSource(source.url)}
                                  className={cn(
                                    "group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all",
                                    isSelected
                                      ? "border-primary bg-primary/10 text-foreground"
                                      : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40"
                                  )}
                                  title={source.rationale}
                                >
                                  <span className="text-sm">{getTypeIcon(source.type)}</span>
                                  <span className="text-sm font-medium max-w-[180px] truncate">
                                    {source.source_name}
                                  </span>
                                  {isSelected && (
                                    <CheckCircle className="w-3.5 h-3.5 text-primary" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-16 space-y-4">
                          <p className="text-muted-foreground">No sources found — you can add them later from your dashboard.</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ========= STEP 3: Building ========= */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4 }}
                      className="pt-12"
                    >
                      {buildError && !topicId ? (
                        <div className="text-center py-16 space-y-4">
                          <p className="text-destructive font-medium">{buildError}</p>
                          <Button variant="outline" onClick={() => setCurrentStep(1)}>
                            Start over
                          </Button>
                        </div>
                      ) : topicId && createdSourceIds.length > 0 ? (
                        <FeedBuildProgress
                          topicId={topicId}
                          topicSlug={topicSlug}
                          topicName={topicName}
                          sourceIds={createdSourceIds}
                          onComplete={handleBuildComplete}
                          onError={handleBuildError}
                        />
                      ) : topicId && createdSourceIds.length === 0 ? (
                        // No sources to link — skip directly to completion
                        (() => {
                          setTimeout(() => setCurrentStep(4), 1500);
                          return (
                            <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
                              <Loader2 className="w-8 h-8 animate-spin text-primary" />
                              <p className="text-muted-foreground">Setting up your feed…</p>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-muted-foreground">Creating your feed…</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ========= STEP 4: Complete ========= */}
                  {currentStep === 4 && (
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4 }}
                      className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 pt-12"
                    >
                      {/* Celebration */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                        className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center"
                      >
                        <CheckCircle className="w-10 h-10 text-accent-foreground" />
                      </motion.div>

                      <div className="text-center space-y-2">
                        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                          {completedStories.length > 0 ? "Your feed is live!" : "Your feed is ready!"}
                        </h2>
                        <p className="text-muted-foreground">
                          {completedStories.length > 0
                            ? `${completedStories.length} stories already curated`
                            : "Stories will appear as sources are scraped"}
                        </p>
                      </div>

                      {/* Story previews */}
                      {completedStories.length > 0 && (
                        <div className="w-full max-w-sm space-y-2">
                          {completedStories.slice(0, 3).map((story, i) => (
                            <motion.div
                              key={story.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.3 + i * 0.1 }}
                              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border"
                            >
                              <Newspaper className="w-4 h-4 text-primary shrink-0" />
                              <span className="text-sm truncate">{story.title}</span>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* CTAs */}
                      <div className="flex flex-col items-center gap-3 w-full max-w-xs pt-4">
                        <Button
                          size="lg"
                          className="w-full gap-2"
                          onClick={() => {
                            handleClose();
                            window.open(`/feed/${topicSlug}`, '_blank');
                          }}
                        >
                          <ExternalLink className="w-4 h-4" />
                          View your feed
                        </Button>
                        <Button
                          variant="ghost"
                          className="gap-2 text-muted-foreground"
                          onClick={() => {
                            onTopicCreated(topicSlug);
                            handleClose();
                          }}
                        >
                          <Settings className="w-4 h-4" />
                          Go to dashboard
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer navigation (steps 1-2 only) */}
            {currentStep <= 2 && (
              <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
                  {currentStep > 1 ? (
                    <Button variant="ghost" onClick={() => setCurrentStep(1)} className="gap-2">
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={handleClose}>
                      Cancel
                    </Button>
                  )}

                  {currentStep === 1 ? (
                    <Button
                      onClick={handleStep1Continue}
                      disabled={!canProceedStep1}
                      className="gap-2"
                    >
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStep2Continue}
                      disabled={selectedSources.size === 0 && sources.length > 0}
                      className="gap-2"
                    >
                      {selectedSources.size === 0 ? 'Skip — add later' : `Build with ${selectedSources.size} sources`}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
