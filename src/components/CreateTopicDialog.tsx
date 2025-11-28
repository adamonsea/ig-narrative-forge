import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, ArrowLeft, Search, X, HelpCircle } from "lucide-react";
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

const EXAMPLE_NAMES = [
  "Eastbourne News",
  "AI & Ethics", 
  "Cycling Culture",
  "Brighton Events",
  "Tech Innovation",
];

const LOADING_MESSAGES = [
  "Quality sources are the foundation of a great feed",
  "Great feeds start with focused keywords",
  "Your audience will thank you for curated content",
  "Building something your readers will love",
  "Precision keywords = better content matching",
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
  
  // Animation states
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_NAMES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Rotate loading messages
  useEffect(() => {
    if (!isGeneratingKeywords) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGeneratingKeywords]);

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
    core: 'Core',
    local: 'Local',
    niche: 'Niche',
    discovery: 'Discovery'
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-10">
        {/* Minimal Progress - just dots */}
        <div className="flex justify-center gap-3 mb-10">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                currentStep === step 
                  ? "bg-foreground w-10" 
                  : currentStep > step 
                    ? "bg-foreground/40 w-4" 
                    : "bg-muted w-4"
              )}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="py-6">
          {/* Step 1: Name */}
          {currentStep === 1 && (
            <div className="space-y-10 animate-in fade-in duration-300">
              <div className="max-w-lg mx-auto space-y-6">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-semibold text-foreground">Topic title</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Choose a clear, descriptive name. This becomes your feed's identity and helps AI generate relevant keywords.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder={EXAMPLE_NAMES[placeholderIndex]}
                  className="text-2xl h-20 text-center font-medium border-2 border-[hsl(270,100%,68%)]/50 focus:border-[hsl(270,100%,68%)] focus:ring-4 focus:ring-[hsl(270,100%,68%)]/20 rounded-xl transition-all placeholder:text-muted-foreground/40 bg-background"
                  autoFocus
                />
              </div>

              {topicName.length >= 3 && (
                <p className="text-center text-base text-muted-foreground animate-in fade-in duration-300">
                  AI is preparing your keywords...
                </p>
              )}
            </div>
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="text-center">
                <h2 className="text-2xl font-display font-bold">Refine your feed</h2>
              </div>

              <div className="space-y-4 max-w-lg mx-auto">
                <div className="grid grid-cols-2 gap-4">
                  <Select value={topicType} onValueChange={(v: any) => setTopicType(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regional">Regional</SelectItem>
                      <SelectItem value="keyword">Interest</SelectItem>
                    </SelectContent>
                  </Select>

                  {topicType === 'regional' ? (
                    <Input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="Region name"
                    />
                  ) : (
                    <Select value={audienceExpertise} onValueChange={setAudienceExpertise}>
                      <SelectTrigger>
                        <SelectValue placeholder="Audience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General audience</SelectItem>
                        <SelectItem value="informed">Informed readers</SelectItem>
                        <SelectItem value="expert">Expert level</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {topicType === 'regional' && (
                  <Select value={audienceExpertise} onValueChange={setAudienceExpertise}>
                    <SelectTrigger>
                      <SelectValue placeholder="Audience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General audience</SelectItem>
                      <SelectItem value="informed">Informed readers</SelectItem>
                      <SelectItem value="expert">Expert level</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What makes this feed unique? (optional)"
                  rows={2}
                />

                {/* Keyword generation state */}
                {isGeneratingKeywords ? (
                  <div className="p-6 border rounded-lg bg-background-elevated text-center space-y-4">
                    <p className="text-lg font-medium text-foreground animate-in fade-in duration-500" key={loadingMessageIndex}>
                      {LOADING_MESSAGES[loadingMessageIndex]}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-7 w-20 rounded-full" />
                      ))}
                    </div>
                  </div>
                ) : generatedKeywords.length > 0 && (
                  <div className="p-4 border rounded-lg bg-background-elevated">
                    <p className="text-sm text-muted-foreground mb-3">
                      {generatedKeywords.length} keywords ready
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {generatedKeywords.slice(0, 10).map((kw) => (
                        <Badge key={kw.keyword} variant="secondary">
                          {kw.keyword}
                        </Badge>
                      ))}
                      {generatedKeywords.length > 10 && (
                        <Badge variant="outline">
                          +{generatedKeywords.length - 10}
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
              <div className="text-center">
                <h2 className="text-2xl font-display font-bold">Curate your keywords</h2>
                <p className="text-muted-foreground mt-1">Tap to remove any that don't fit</p>
              </div>

              {/* Quick actions */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedKeywords.size} selected</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkAction('selectHighConfidence')}
                  >
                    Best only
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkAction('deselectAll')}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkAction('selectAll')}
                  >
                    All
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

              {/* Keyword pills by category */}
              <div className="space-y-4 max-h-[280px] overflow-y-auto">
                {Object.entries(groupedKeywords).map(([category, keywords]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {categoryLabels[category] || category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((kw) => {
                        const isSelected = selectedKeywords.has(kw.keyword);
                        return (
                          <button
                            key={kw.keyword}
                            onClick={() => handleToggleKeyword(kw.keyword)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all",
                              "border hover:scale-105",
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:border-primary/50"
                            )}
                            title={kw.rationale}
                          >
                            {kw.keyword}
                            {isSelected && <X className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Selection summary */}
              {selectedKeywords.size > 0 && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium mb-2">Your feed will search for:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedKeywords).slice(0, 8).map((kw) => (
                      <Badge key={kw} variant="secondary">
                        {kw}
                      </Badge>
                    ))}
                    {selectedKeywords.size > 8 && (
                      <Badge variant="outline">
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
        <div className="flex justify-end items-center pt-8 mt-6">
          {currentStep > 1 && (
            <Button
              variant="ghost"
              onClick={handleBack}
              className="mr-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          {currentStep < 3 ? (
            <Button onClick={handleNext} disabled={!canProceed()} className="bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,60%)] text-white">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!canProceed() || isLoading} className="bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,60%)] text-white">
              {isLoading ? "Creating..." : "Create Feed"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
