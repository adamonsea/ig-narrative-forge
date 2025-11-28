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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, ArrowRight, ArrowLeft, Wand2, Search, X, Newspaper, Users, TrendingUp, Zap, Heart, Check } from "lucide-react";
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
  { id: 1, title: "Name", icon: Sparkles },
  { id: 2, title: "Details", icon: Wand2 },
  { id: 3, title: "Keywords", icon: Check },
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
      const commonCityWords = ['news', 'events', 'local', 'area', 'community'];
      const hasRegionalIndicator = commonCityWords.some(word => 
        topicName.toLowerCase().includes(word)
      );
      
      if (hasRegionalIndicator && topicType === 'keyword') {
        setTopicType('regional');
        const words = topicName.split(' ');
        const potentialRegion = words.find(w => 
          !commonCityWords.includes(w.toLowerCase()) && w.length > 2
        );
        if (potentialRegion) {
          setRegion(potentialRegion);
        }
      }

      if (!description) {
        if (topicType === 'regional') {
          setDescription(`Stay updated with the latest news, events, and community stories from ${topicName}.`);
        } else {
          setDescription(`Curated updates and insights about ${topicName}.`);
        }
      }

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
        description: "Now let's find some quality content sources...",
      });

      onTopicCreated(`${slug}?sources=true`);
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

  // Filter keywords by search
  const filteredKeywords = generatedKeywords.filter(kw =>
    kw.keyword.toLowerCase().includes(keywordSearch.toLowerCase())
  );

  // Group keywords by category
  const groupedKeywords = filteredKeywords.reduce((acc, kw) => {
    if (!acc[kw.category]) acc[kw.category] = [];
    acc[kw.category].push(kw);
    return acc;
  }, {} as Record<string, GeneratedKeyword[]>);

  const categoryLabels: Record<string, string> = {
    core: 'Core Topics',
    local: 'Local Context',
    niche: 'Niche Focus',
    discovery: 'Discovery'
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Create Feed</DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-1",
                    currentStep === step.id && "text-foreground font-medium"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span>{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="py-4">
          {/* Step 1: Name */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-display font-bold">What's your feed about?</h2>
                <p className="text-sm text-muted-foreground">Give it a name that captures your focus</p>
              </div>

              <div className="max-w-md mx-auto">
                <Input
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder={EXAMPLE_NAMES[placeholderIndex]}
                  className="text-lg h-12 text-center"
                  autoFocus
                />
              </div>

              {topicName.length >= 3 && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary animate-in fade-in duration-300">
                  <Sparkles className="w-4 h-4" />
                  <span>AI is preparing your keywords...</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-display font-bold">Add Details</h2>
                <p className="text-sm text-muted-foreground">Help AI find better keywords</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Type</Label>
                    <Select value={topicType} onValueChange={(v: any) => setTopicType(v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regional">Regional</SelectItem>
                        <SelectItem value="keyword">Interest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {topicType === 'regional' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Region</Label>
                      <Input
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        placeholder="e.g., Eastbourne"
                        className="h-9"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">Audience</Label>
                    <Select value={audienceExpertise} onValueChange={setAudienceExpertise}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="informed">Informed</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Description (optional)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What makes this feed unique?"
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Keyword preview */}
                {isGeneratingKeywords ? (
                  <div className="p-4 border rounded-lg bg-background-elevated space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="w-4 h-4 animate-pulse text-primary" />
                      <span>Generating keywords...</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} className="h-6 w-20 rounded-full" />
                      ))}
                    </div>
                  </div>
                ) : generatedKeywords.length > 0 && (
                  <div className="p-4 border rounded-lg bg-background-elevated">
                    <p className="text-xs text-muted-foreground mb-2">
                      {generatedKeywords.length} keywords ready
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {generatedKeywords.slice(0, 12).map((kw) => (
                        <Badge key={kw.keyword} variant="secondary" className="text-xs">
                          {kw.keyword}
                        </Badge>
                      ))}
                      {generatedKeywords.length > 12 && (
                        <Badge variant="outline" className="text-xs">
                          +{generatedKeywords.length - 12}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Refine Keywords */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-display font-bold">Refine Keywords</h2>
                <p className="text-sm text-muted-foreground">
                  Click to deselect any that don't fit
                </p>
              </div>

              {/* Quick actions */}
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="px-2 py-0.5">
                  {selectedKeywords.size} selected
                </Badge>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleBulkAction('selectHighConfidence')}
                  >
                    Best only
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleBulkAction('deselectAll')}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleBulkAction('selectAll')}
                  >
                    All
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* Keyword pills by category */}
              <div className="space-y-4 max-h-[300px] overflow-y-auto">
                {Object.entries(groupedKeywords).map(([category, keywords]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {categoryLabels[category] || category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((kw) => {
                        const isSelected = selectedKeywords.has(kw.keyword);
                        return (
                          <button
                            key={kw.keyword}
                            onClick={() => handleToggleKeyword(kw.keyword)}
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all",
                              "border hover:scale-105",
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:border-primary/50"
                            )}
                            title={kw.rationale}
                          >
                            {kw.keyword}
                            {isSelected && <X className="w-3 h-3 ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Selection summary */}
              {selectedKeywords.size > 0 && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-xs font-medium mb-1.5">Your feed will search for:</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(selectedKeywords).slice(0, 8).map((kw) => (
                      <Badge key={kw} variant="secondary" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                    {selectedKeywords.size > 8 && (
                      <Badge variant="outline" className="text-xs">
                        +{selectedKeywords.size - 8}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>

            {currentStep < 3 ? (
              <Button size="sm" onClick={handleNext} disabled={!canProceed()}>
                Next
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleCreate} disabled={!canProceed() || isLoading}>
                {isLoading ? "Creating..." : "Create Feed"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
