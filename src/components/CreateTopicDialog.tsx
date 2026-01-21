import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, ArrowLeft, Search, X, Loader2, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

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

  // Group keywords by category
  const groupedKeywords = generatedKeywords.reduce((acc, kw) => {
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

  const stepTitles = {
    1: "Name your feed",
    2: "Describe your feed",
    3: "Select keywords"
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

          {/* Main container */}
          <div className="h-full flex flex-col">
            {/* Header with progress */}
            <div className="flex-shrink-0 pt-16 pb-8 px-6">
              {/* Step indicator */}
              <div className="flex justify-center gap-2 mb-8">
                {[1, 2, 3].map((step) => (
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

              {/* Step title */}
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <p className="text-sm text-muted-foreground mb-2">Step {currentStep} of 3</p>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                  {stepTitles[currentStep as keyof typeof stepTitles]}
                </h1>
              </motion.div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto px-6">
              <div className="max-w-lg mx-auto pb-32">
                <AnimatePresence mode="wait">
                  {/* Step 1: Name */}
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
                        <Input
                          value={topicName}
                          onChange={(e) => setTopicName(e.target.value)}
                          placeholder={EXAMPLE_NAMES[placeholderIndex]}
                          className="text-xl md:text-2xl h-16 text-center font-medium border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl transition-all placeholder:text-muted-foreground/40"
                          autoFocus
                        />
                        <p className="text-center text-sm text-muted-foreground">
                          Choose a clear, memorable name for your feed
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Details */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6 pt-8"
                    >
                      {/* Feed type selection */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setTopicType('keyword')}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all text-left",
                            topicType === 'keyword'
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/30"
                          )}
                        >
                          <p className="font-medium">Interest-based</p>
                          <p className="text-sm text-muted-foreground">Topic or theme</p>
                        </button>
                        <button
                          onClick={() => setTopicType('regional')}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all text-left",
                            topicType === 'regional'
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/30"
                          )}
                        >
                          <p className="font-medium">Regional</p>
                          <p className="text-sm text-muted-foreground">Local area news</p>
                        </button>
                      </div>

                      {/* Region input for regional type */}
                      {topicType === 'regional' && (
                        <Input
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="Enter region name (e.g., Brighton, East Sussex)"
                          className="h-12"
                        />
                      )}

                      {/* Audience selector */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Audience level</label>
                        <Select value={audienceExpertise} onValueChange={setAudienceExpertise}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Select audience" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-lg">
                            <SelectItem value="general">General audience</SelectItem>
                            <SelectItem value="informed">Informed readers</SelectItem>
                            <SelectItem value="expert">Expert level</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Description */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Description</label>
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe your feed to improve keyword accuracy..."
                          rows={3}
                          className="resize-none"
                        />
                      </div>

                      {/* Keyword generation */}
                      {isGeneratingKeywords ? (
                        <div className="p-8 border rounded-xl bg-muted/30 text-center space-y-4">
                          <div className="flex items-center justify-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <span className="font-medium">Generating keywords...</span>
                          </div>
                          <p className="text-sm text-muted-foreground animate-pulse" key={loadingMessageIndex}>
                            {LOADING_MESSAGES[loadingMessageIndex]}
                          </p>
                          <div className="flex flex-wrap justify-center gap-2">
                            {[...Array(6)].map((_, i) => (
                              <Skeleton key={i} className="h-7 w-16 rounded-full" />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={generateKeywords}
                          disabled={!topicName}
                          size="lg"
                          className="w-full h-14 text-base"
                        >
                          <Sparkles className="w-5 h-5 mr-2" />
                          Generate Keywords
                        </Button>
                      )}
                    </motion.div>
                  )}

                  {/* Step 3: Keywords */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6 pt-8"
                    >
                      {/* Selection count */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{selectedKeywords.size}</span> keywords selected
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleBulkAction('deselectAll')}
                            className="text-xs"
                          >
                            Clear
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleBulkAction('selectAll')}
                            className="text-xs"
                          >
                            Select all
                          </Button>
                        </div>
                      </div>

                      {/* Keyword categories */}
                      <div className="space-y-5 max-h-[40vh] overflow-y-auto pr-1">
                        {Object.entries(groupedKeywords).map(([category, keywords]) => (
                          <div key={category} className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                      isSelected
                                        ? "bg-primary text-primary-foreground"
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

                      {/* Manual keyword input */}
                      <div className="flex gap-2">
                        <Input
                          value={manualKeyword}
                          onChange={(e) => setManualKeyword(e.target.value)}
                          placeholder="Add custom keyword"
                          className="flex-1"
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer navigation - fixed at bottom */}
            <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
                {currentStep > 1 ? (
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    className="gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                )}

                {currentStep < 3 ? (
                  <Button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className="gap-2"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleCreate}
                    disabled={!canProceed() || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Feed"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
