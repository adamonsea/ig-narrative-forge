import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KeywordCategoryGrid } from "./KeywordCategoryGrid";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, ArrowRight, ArrowLeft, Wand2, Search, Filter, Newspaper, Users, TrendingUp, Zap, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneratedKeyword {
  keyword: string;
  category: 'core' | 'local' | 'niche' | 'discovery';
  confidence: number;
  rationale: string;
  preSelected: boolean;
}

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopicCreated: (topicSlug: string) => void;
}

const STEPS = [
  { id: 1, title: "Name Your Feed", icon: Sparkles },
  { id: 2, title: "Describe & Refine", icon: Wand2 },
  { id: 3, title: "Prune Your Garden", icon: Filter },
];

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
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  
  // Form data
  const [topicName, setTopicName] = useState("");
  const [topicType, setTopicType] = useState<"regional" | "keyword">("keyword");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");
  const [audienceExpertise, setAudienceExpertise] = useState("general");
  
  // Keywords
  const [generatedKeywords, setGeneratedKeywords] = useState<GeneratedKeyword[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [keywordSearch, setKeywordSearch] = useState("");
  
  // Placeholder animation
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_NAMES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-detect region and generate keywords when name changes
  useEffect(() => {
    if (!topicName || topicName.length < 3) return;

    const timeoutId = setTimeout(() => {
      // Auto-detect if it's regional
      const commonCityWords = ['news', 'events', 'local', 'area', 'community'];
      const hasRegionalIndicator = commonCityWords.some(word => 
        topicName.toLowerCase().includes(word)
      );
      
      if (hasRegionalIndicator && topicType === 'keyword') {
        setTopicType('regional');
        // Extract potential region name (first word that's not a common word)
        const words = topicName.split(' ');
        const potentialRegion = words.find(w => 
          !commonCityWords.includes(w.toLowerCase()) && w.length > 2
        );
        if (potentialRegion) {
          setRegion(potentialRegion);
        }
      }

      // Auto-generate description
      if (!description) {
        if (topicType === 'regional') {
          setDescription(`Stay updated with the latest news, events, and community stories from ${topicName}.`);
        } else {
          setDescription(`Curated updates and insights about ${topicName}.`);
        }
      }

      // Generate keywords in background
      generateKeywords();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [topicName]);

  const generateKeywords = async () => {
    if (!topicName) return;

    setIsGeneratingKeywords(true);

    try {
      const { data, error } = await supabase.functions.invoke('auto-generate-topic-keywords', {
        body: {
          topicName,
          description: description || undefined,
          topicType,
          region: region || undefined,
        },
      });

      if (error) throw error;

      if (data?.keywords) {
        setGeneratedKeywords(data.keywords);
        // Pre-select all keywords marked as preSelected
        const preSelected = new Set<string>(
          data.keywords
            .filter((k: GeneratedKeyword) => k.preSelected)
            .map((k: GeneratedKeyword) => k.keyword)
        );
        setSelectedKeywords(preSelected);
      }
    } catch (error) {
      console.error('Failed to generate keywords:', error);
      toast({
        title: "Keyword generation failed",
        description: "We'll use basic keywords. You can add more later.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const handleToggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  };

  const handleBulkAction = (action: 'selectAll' | 'deselectAll' | 'selectHighConfidence') => {
    if (action === 'selectAll') {
      setSelectedKeywords(new Set(generatedKeywords.map(k => k.keyword)));
    } else if (action === 'deselectAll') {
      setSelectedKeywords(new Set());
    } else if (action === 'selectHighConfidence') {
      const highConfidence = generatedKeywords
        .filter(k => k.confidence >= 0.85)
        .map(k => k.keyword);
      setSelectedKeywords(new Set(highConfidence));
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return topicName.length >= 3;
    if (currentStep === 2) return true;
    if (currentStep === 3) return selectedKeywords.size >= 3;
    return false;
  };

  const handleNext = () => {
    if (currentStep === 2 && generatedKeywords.length === 0) {
      generateKeywords();
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleCreate = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to create a topic",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const slug = topicName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Map audience expertise to the expected enum values
      const audienceMap: Record<string, 'beginner' | 'intermediate' | 'expert'> = {
        'general': 'beginner',
        'informed': 'intermediate',
        'expert': 'expert'
      };

      const { error } = await supabase.from('topics').insert({
        name: topicName,
        slug,
        topic_type: topicType,
        region: region || null,
        description: description || null,
        keywords: Array.from(selectedKeywords),
        audience_expertise: audienceMap[audienceExpertise] || 'beginner',
        is_active: true,
        created_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Feed created! 🎉",
        description: "Your topic feed is ready to start gathering stories.",
      });

      onTopicCreated(slug);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create topic:', error);
      toast({
        title: "Failed to create feed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setTopicName("");
    setTopicType("keyword");
    setRegion("");
    setDescription("");
    setAudienceExpertise("general");
    setGeneratedKeywords([]);
    setSelectedKeywords(new Set());
    setKeywordSearch("");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const progress = (currentStep / 3) * 100;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Create Your Feed</DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-1.5",
                    currentStep === step.id && "text-foreground font-medium"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="py-6">
          {/* Step 1: Name Your Feed */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-display font-bold">What's your feed about?</h2>
                <p className="text-muted-foreground">Give it a name that captures what you're interested in</p>
              </div>

              <div className="max-w-md mx-auto">
                <Input
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder={EXAMPLE_NAMES[placeholderIndex]}
                  className="text-lg h-14 text-center transition-all duration-300"
                  autoFocus
                />
                {topicName.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {topicName.length} characters
                  </p>
                )}
              </div>

              {topicName.length >= 3 && (
                <div className="flex items-center justify-center gap-2 text-sm text-accent-green animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Sparkles className="w-4 h-4" />
                  <span>AI is preparing your keywords...</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Describe & Refine */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-display font-bold">Refine Your Feed</h2>
                <p className="text-muted-foreground">Add details and watch your keyword list grow</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Left: Details */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Topic Type</Label>
                    <Select value={topicType} onValueChange={(v: any) => setTopicType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regional">Regional News</SelectItem>
                        <SelectItem value="keyword">Interest-Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {topicType === 'regional' && (
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Input
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        placeholder="e.g., Eastbourne, Brighton"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Description (Optional)</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What makes this feed unique?"
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Audience Level</Label>
                    <Select value={audienceExpertise} onValueChange={setAudienceExpertise}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Public</SelectItem>
                        <SelectItem value="informed">Informed Reader</SelectItem>
                        <SelectItem value="expert">Expert/Professional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Right: Live Keyword Preview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Live Keyword Preview</Label>
                    {isGeneratingKeywords && (
                      <Badge variant="secondary" className="animate-pulse">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Generating...
                      </Badge>
                    )}
                  </div>

                  <div className="border rounded-lg p-4 bg-background-elevated min-h-[300px] space-y-3">
                    {isGeneratingKeywords ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {[...Array(8)].map((_, i) => (
                            <Skeleton key={i} className="h-8 w-full" />
                          ))}
                        </div>
                        
                        {/* Onboarding Ticker */}
                        <div className="mt-6 pt-4 border-t border-border/30">
                          <div className="space-y-2 overflow-hidden h-12">
                            <div className="animate-[slide-up_12s_ease-in-out_infinite] space-y-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Sparkles className="w-4 h-4 text-accent-purple" />
                                <span>Building your personalized news feed...</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Newspaper className="w-4 h-4 text-accent-cyan" />
                                <span>Curating quality sources from trusted publishers</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Users className="w-4 h-4 text-accent-green" />
                                <span>Engaging readers with interactive stories & quizzes</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <TrendingUp className="w-4 h-4 text-accent-orange" />
                                <span>Tracking sentiment & community pulse in real-time</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Zap className="w-4 h-4 text-accent-yellow" />
                                <span>Auto-publishing fresh stories daily to your feed</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Heart className="w-4 h-4 text-accent-pink" />
                                <span>Building lasting connections with your audience</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : generatedKeywords.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {generatedKeywords.length} keywords ready
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {generatedKeywords.slice(0, 15).map((kw) => (
                            <Badge
                              key={kw.keyword}
                              variant="secondary"
                              className="animate-in fade-in slide-in-from-bottom-1 duration-200"
                            >
                              {kw.keyword}
                            </Badge>
                          ))}
                          {generatedKeywords.length > 15 && (
                            <Badge variant="outline">
                              +{generatedKeywords.length - 15} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p className="text-sm">Keywords will appear here as you type...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Prune Your Garden */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-display font-bold">🌱 Prune Your Garden</h2>
                <p className="text-muted-foreground">
                  Remove keywords that don't fit. Everything's pre-selected for you.
                </p>
              </div>

              {/* Stats & Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-background-elevated rounded-lg">
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" className="text-base px-3 py-1">
                    {selectedKeywords.size} selected
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Recommended: 25-40 keywords
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('selectHighConfidence')}
                  >
                    High Priority Only
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('deselectAll')}
                  >
                    Clear All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('selectAll')}
                  >
                    Select All
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  placeholder="Search keywords..."
                  className="pl-10"
                />
              </div>

              {/* Keyword Grid */}
              <KeywordCategoryGrid
                keywords={generatedKeywords}
                selectedKeywords={selectedKeywords}
                onToggleKeyword={handleToggleKeyword}
                searchFilter={keywordSearch}
              />

              {/* Preview */}
              {selectedKeywords.size > 0 && (
                <div className="p-4 bg-accent-green/5 border border-accent-green/20 rounded-lg">
                  <p className="text-sm font-medium mb-2">Your feed will look for:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedKeywords).slice(0, 10).map((kw) => (
                      <Badge key={kw} variant="secondary">
                        {kw}
                      </Badge>
                    ))}
                    {selectedKeywords.size > 10 && (
                      <Badge variant="outline">+{selectedKeywords.size - 10} more</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>

            {currentStep < 3 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={!canProceed() || isLoading}>
                {isLoading ? "Creating..." : "Create Feed"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
