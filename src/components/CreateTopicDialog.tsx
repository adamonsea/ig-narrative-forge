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
import { ArrowRight, ArrowLeft, Search, X, HelpCircle, Loader2, Plus } from "lucide-react";
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
  const [manualKeyword, setManualKeyword] = useState("");
  
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

  // Auto-progress to step 3 when keywords are generated
  useEffect(() => {
    if (currentStep === 2 && generatedKeywords.length > 0 && !isGeneratingKeywords) {
      const timer = setTimeout(() => {
        setCurrentStep(3);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentStep, generatedKeywords.length, isGeneratingKeywords]);

  // Auto-detect region from topic name
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
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [topicName]);

  // Auto-populate description when entering step 2
  useEffect(() => {
    if (currentStep === 2 && !description && topicName) {
      if (topicType === 'regional') {
        setDescription(`Stay updated with the latest news, events, and community stories from ${region || topicName}.`);
      } else {
        setDescription(`Curated updates and insights about ${topicName}.`);
      }
    }
  }, [currentStep, topicName, topicType, region]);

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
          targetCount: 50,
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

      if (error) {
        if (error.code === '23505') {
          throw new Error(`A feed with the name "${topicName}" already exists. Try a different name.`);
        }
        throw error;
      }

      toast({
        title: "Feed created!",
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
    setManualKeyword("");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const progress = (currentStep / 3) * 100;

  // Filter keywords by search
  const filteredKeywords = generatedKeywords;

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
            </div>
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="text-center">
                <h2 className="text-3xl font-semibold text-foreground">Refine your feed</h2>
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
                  placeholder="Refine this to improve keyword accuracy — the more specific, the better your matches"
                  rows={2}
                />

                {/* Keyword generation trigger */}
                {isGeneratingKeywords ? (
                  <div className="p-8 border rounded-xl bg-muted/30 text-center space-y-4">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-[hsl(270,100%,68%)]" />
                      <span className="text-lg font-medium text-foreground">Finding keywords...</span>
                    </div>
                    <p className="text-base text-muted-foreground animate-in fade-in duration-500" key={loadingMessageIndex}>
                      {LOADING_MESSAGES[loadingMessageIndex]}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} className="h-7 w-20 rounded-full" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={generateKeywords}
                    disabled={!topicName}
                    className="w-full h-14 text-lg bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,60%)] text-white"
                  >
                    <Search className="w-5 h-5 mr-2" />
                    Generate Keywords
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Refine Keywords */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="text-center space-y-1">
                <h2 className="text-3xl font-semibold text-foreground">Curate your keywords</h2>
                <p className="text-muted-foreground">Tap to toggle • {selectedKeywords.size} selected</p>
              </div>

              {/* Quick actions row */}
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('deselectAll')}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('selectAll')}
                >
                  All
                </Button>
              </div>

              {/* Keyword pills by category */}
              <div className="space-y-4 max-h-[240px] overflow-y-auto px-1">
                {Object.entries(groupedKeywords).map(([category, keywords]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                              "px-2.5 py-1 rounded-full text-sm transition-all",
                              isSelected
                                ? "bg-[hsl(270,100%,68%)] text-white"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            title={kw.rationale}
                          >
                            {kw.keyword}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Manual add */}
              <div className="flex gap-2 max-w-sm mx-auto">
                <Input
                  value={manualKeyword}
                  onChange={(e) => setManualKeyword(e.target.value)}
                  placeholder="Add your own keyword"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualKeyword.trim()) {
                      setSelectedKeywords(prev => new Set([...prev, manualKeyword.trim()]));
                      setManualKeyword("");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (manualKeyword.trim()) {
                      setSelectedKeywords(prev => new Set([...prev, manualKeyword.trim()]));
                      setManualKeyword("");
                    }
                  }}
                  disabled={!manualKeyword.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-end items-center pt-6">
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

          {currentStep === 1 && (
            <Button onClick={handleNext} disabled={!canProceed()} className="bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,60%)] text-white">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          {currentStep === 3 && (
            <Button onClick={handleCreate} disabled={!canProceed() || isLoading} className="bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,60%)] text-white">
              {isLoading ? "Creating..." : "Create Feed"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
