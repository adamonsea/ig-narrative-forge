import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowRight, Globe, Hash, MapPin, X, Sparkles, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface KeywordSuggestion {
  keyword: string;
  confidence: number;
  rationale: string;
}

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopicCreated: (topicSlug: string) => void;
}

const STEPS = [
  { id: 1, title: "Topic Name", icon: Hash },
  { id: 2, title: "Topic Type", icon: Globe },
  { id: 3, title: "Description", icon: Globe },
  { id: 4, title: "Keywords", icon: Hash },
  { id: 5, title: "Audience", icon: Globe },
];

export const CreateTopicDialog = ({ open, onOpenChange, onTopicCreated }: CreateTopicDialogProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    topic_type: 'keyword' as 'keyword' | 'regional',
    description: '',
    keywords: [] as string[],
    audience_expertise: 'intermediate' as 'beginner' | 'intermediate' | 'expert',
    region: ''
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [creating, setCreating] = useState(false);
  // Removed preview colors - using design system tokens instead
  const [smartSuggestions, setSmartSuggestions] = useState<KeywordSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestionPreview, setShowSuggestionPreview] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [hasAutoPopulated, setHasAutoPopulated] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  // Auto-populate generic regional keywords when region is set
  useEffect(() => {
    if (
      formData.topic_type === 'regional' && 
      formData.region && 
      formData.keywords.length === 0 &&
      !hasAutoPopulated
    ) {
      const regionLower = formData.region.toLowerCase().trim();
      
      // Tier 1: Universal keywords
      const universalKeywords = [
        'crime', 'police', 'community', 'council', 'planning',
        'events', 'fire', 'ambulance', 'court', 'development',
        'housing', 'transport', 'business', 'health', 'education',
        'schools', 'hospital', 'traffic', 'parking', 'shops'
      ];
      
      // Tier 2: Regional templates with region name
      const regionalTemplates = [
        `${regionLower} news`,
        `${regionLower} community`,
        `${regionLower} crime`,
        `${regionLower} council`,
        `${regionLower} events`,
        `${regionLower} planning`,
        `${regionLower} development`,
        `${regionLower} business`,
        `${regionLower} town centre`,
        `${regionLower} high street`,
        `${regionLower} tourism`,
        `${regionLower} transport`
      ];
      
      const genericKeywords = [...universalKeywords, ...regionalTemplates];
      
      setFormData({
        ...formData,
        keywords: genericKeywords
      });
      
      setHasAutoPopulated(true);
      
      toast({
        title: "✨ Keywords auto-populated!",
        description: `Added ${genericKeywords.length} proven regional keywords. Remove any you don't need or add your own.`,
        duration: 5000
      });
    }
  }, [formData.topic_type, formData.region, hasAutoPopulated]);

  // Removed preview colors effect - using design system tokens instead

  // Auto-save to localStorage
  useEffect(() => {
    if (user && (formData.name || formData.description || formData.keywords.length > 0)) {
      localStorage.setItem(`topic-draft-${user.id}`, JSON.stringify(formData));
    }
  }, [formData, user]);

  // Load saved data when dialog opens
  useEffect(() => {
    if (open && user) {
      const saved = localStorage.getItem(`topic-draft-${user.id}`);
      if (saved) {
        try {
          const savedData = JSON.parse(saved);
          setFormData(savedData);
          toast({
            title: "Draft restored",
            description: "Your previous topic draft has been restored"
          });
        } catch (error) {
          console.error('Error loading saved data:', error);
        }
      }
    }
  }, [open, user, toast]);

  // Load smart suggestions when regional type is selected
  useEffect(() => {
    if (formData.topic_type === 'regional' && currentStep === 4 && smartSuggestions.length === 0 && !loadingSuggestions) {
      loadSmartSuggestions();
    }
  }, [formData.topic_type, currentStep]);

  const loadSmartSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-regional-keywords', {
        body: {
          topicType: formData.topic_type,
          region: formData.region || formData.name,
          existingKeywords: formData.keywords
        }
      });
      
      if (error) throw error;
      
      if (data?.suggestions) {
        setSmartSuggestions(data.suggestions);
        // Pre-select all by default
        setSelectedSuggestions(data.suggestions.map((s: KeywordSuggestion) => s.keyword));
      }
    } catch (error) {
      console.error('Failed to load smart suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const acceptAllSuggestions = () => {
    const newKeywords = smartSuggestions
      .map(s => s.keyword)
      .filter(k => !formData.keywords.includes(k));
    
    setFormData({
      ...formData,
      keywords: [...formData.keywords, ...newKeywords]
    });
    
    toast({
      title: "Keywords added!",
      description: `Added ${newKeywords.length} proven keywords to your topic`
    });
  };

  const addSelectedSuggestions = () => {
    const newKeywords = selectedSuggestions
      .filter(k => !formData.keywords.includes(k));
    
    setFormData({
      ...formData,
      keywords: [...formData.keywords, ...newKeywords]
    });
    
    setShowSuggestionPreview(false);
    
    toast({
      title: "Keywords added!",
      description: `Added ${newKeywords.length} keywords to your topic`
    });
  };

  const toggleSuggestion = (keyword: string, checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedSuggestions([...selectedSuggestions, keyword]);
    } else {
      setSelectedSuggestions(selectedSuggestions.filter(k => k !== keyword));
    }
  };

  const clearDraft = () => {
    if (user) {
      localStorage.removeItem(`topic-draft-${user.id}`);
    }
  };

  const clearAllKeywords = () => {
    setFormData({
      ...formData,
      keywords: []
    });
    setHasAutoPopulated(false);
    toast({
      title: "Keywords cleared",
      description: "All keywords have been removed. You can add your own or let them auto-populate again.",
    });
  };

  const nextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.keywords.includes(keywordInput.trim().toLowerCase())) {
      setFormData({
        ...formData,
        keywords: [...formData.keywords, keywordInput.trim().toLowerCase()]
      });
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData({
      ...formData,
      keywords: formData.keywords.filter(k => k !== keyword)
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.name.trim().length > 0;
      case 2: return formData.topic_type === 'keyword' || (formData.topic_type === 'regional' && formData.region.trim().length > 0);
      case 3: return true; // Description is optional
      case 4: return formData.keywords.length > 0;
      case 5: return formData.audience_expertise === 'beginner' || formData.audience_expertise === 'intermediate' || formData.audience_expertise === 'expert';
      default: return false;
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Topic name is required",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      const slug = formData.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const topicData = {
        name: formData.name,
        description: formData.description || null,
        topic_type: formData.topic_type,
        keywords: formData.keywords,
        region: formData.topic_type === 'regional' ? formData.region : null,
        slug,
        is_active: false, // Start as draft
        created_by: user?.id,
        audience_expertise: formData.audience_expertise,
        default_tone: 'conversational' as const
      };

      const { error } = await supabase
        .from('topics')
        .insert([topicData]);

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Your topic has been created"
      });

      clearDraft();
      onOpenChange(false);
      onTopicCreated(slug);

    } catch (error) {
      console.error('Error creating topic:', error);
      toast({
        title: "Error",
        description: "Failed to create topic",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      topic_type: 'keyword',
      description: '',
      keywords: [],
      audience_expertise: 'intermediate',
      region: ''
    });
    setCurrentStep(1);
    setKeywordInput('');
    clearDraft();
  };

  const handleClose = () => {
    resetForm();
    setHasAutoPopulated(false);
    onOpenChange(false);
  };

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Create New Topic
          </DialogTitle>
          <div className="flex items-center gap-3 mt-4">
            <Progress value={progress} className="flex-1" />
            <span className="text-sm font-medium text-muted-foreground">
              {currentStep}/{STEPS.length}
            </span>
          </div>
        </DialogHeader>

        <div className="py-8">
          {/* Step 1: Topic Name */}
          {currentStep === 1 && (
            <div className="space-y-6 text-center">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold">What's your topic called?</h2>
                <p className="text-lg text-muted-foreground">
                  Give your topic a clear, memorable name
                </p>
              </div>
              <div className="max-w-md mx-auto">
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., AI & Technology"
                  className="text-xl p-6 text-center"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2 justify-center text-sm text-muted-foreground">
                <span>Examples:</span>
                <Badge variant="outline">Local News</Badge>
                <Badge variant="outline">Cycling Culture</Badge>
                <Badge variant="outline">AI & Ethics</Badge>
              </div>
            </div>
          )}

          {/* Step 2: Topic Type */}
          {currentStep === 2 && (
            <div className="space-y-6 text-center">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold">What type of topic is this?</h2>
                <p className="text-lg text-muted-foreground">
                  Choose the approach that fits your content
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                <button
                  onClick={() => setFormData({ ...formData, topic_type: 'keyword' })}
                  className={`p-8 rounded-lg border-2 transition-all hover:shadow-md ${
                    formData.topic_type === 'keyword'
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <Hash className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-xl font-semibold mb-2">Interest Topic</h3>
                  <p className="text-sm text-muted-foreground">Based on keywords and themes</p>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, topic_type: 'regional', region: formData.name })}
                  className={`p-8 rounded-lg border-2 transition-all hover:shadow-md ${
                    formData.topic_type === 'regional'
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <MapPin className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-xl font-semibold mb-2">Local News</h3>
                  <p className="text-sm text-muted-foreground">Location-based content</p>
                </button>
              </div>
              
              {/* Region input for regional topics */}
              {formData.topic_type === 'regional' && (
                <div className="mt-6 max-w-md mx-auto">
                  <Label htmlFor="region" className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4" />
                    Region/Town Name
                  </Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="e.g., Hastings, Brighton, Lewes"
                    className="text-lg p-4"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Used for parliamentary tracking and regional content filtering
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Description */}
          {currentStep === 3 && (
            <div className="space-y-6 text-center">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold">Describe your topic</h2>
                <p className="text-lg text-muted-foreground">
                  One sentence about what you'll cover (optional)
                </p>
              </div>
              <div className="max-w-xl mx-auto">
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Latest developments in artificial intelligence and machine learning"
                  className="text-lg p-6 text-center min-h-[120px]"
                  maxLength={200}
                />
                <div className="mt-2 text-sm text-muted-foreground">
                  {formData.description.length}/200 characters
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Keywords */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-3 text-center">
                <h2 className="text-3xl font-bold">What keywords describe your topic?</h2>
                <p className="text-lg text-muted-foreground">
                  Add words that help find relevant content
                </p>
              </div>

              {/* Auto-populated Keywords Banner */}
              {formData.topic_type === 'regional' && formData.keywords.length > 0 && hasAutoPopulated && (
                <div className="p-4 bg-accent rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Wand2 className="h-5 w-5 text-pop mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm mb-1">
                        Generic keywords auto-added
                      </p>
                      <p className="text-sm text-muted-foreground mb-3">
                        These {formData.keywords.length} keywords work well across regional topics. Remove any that don't fit your focus, or add your own specific keywords.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearAllKeywords}
                      >
                        Clear all keywords
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Smart Setup for Regional Topics */}
              {formData.topic_type === 'regional' && smartSuggestions.length > 0 && (
                <div className="bg-accent border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-pop mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">Smart Setup Available</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        Based on successful regional feeds, we can pre-fill {smartSuggestions.length} proven keywords for local news coverage.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={acceptAllSuggestions}
                          variant="default"
                          size="sm"
                        >
                          Add All {smartSuggestions.length} Keywords
                        </Button>
                        <Button
                          onClick={() => setShowSuggestionPreview(true)}
                          variant="outline"
                          size="sm"
                        >
                          Preview Keywords
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {formData.topic_type === 'regional' && loadingSuggestions && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading smart suggestions...</span>
                </div>
              )}

              {/* Manual keyword entry */}
              <div className="max-w-xl mx-auto space-y-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-center">Add Keywords Manually</h3>
                  <div className="flex gap-2">
                    <Input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="Enter a keyword"
                      className="text-lg p-4"
                      onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                    />
                    <Button onClick={addKeyword} disabled={!keywordInput.trim()}>
                      Add
                    </Button>
                  </div>
                </div>

                {/* Show added keywords */}
                <div className="flex flex-wrap gap-2 justify-center min-h-[60px]">
                  {formData.keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="text-sm py-1 px-3">
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                {formData.keywords.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center">No keywords added yet</p>
                )}
                
                {/* Show count and recommendation */}
                <p className="text-sm text-muted-foreground text-center">
                  {formData.keywords.length} keyword{formData.keywords.length !== 1 ? 's' : ''} added
                  {formData.keywords.length < 10 && formData.keywords.length > 0 && " • Recommended: 10-20 keywords"}
                </p>
              </div>
            </div>
          )}

          {/* Preview Modal */}
          {showSuggestionPreview && (
            <Dialog open={showSuggestionPreview} onOpenChange={setShowSuggestionPreview}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Recommended Keywords for {formData.name || 'Your Topic'}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {smartSuggestions.map((suggestion) => (
                      <div key={suggestion.keyword} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent transition-colors">
                        <Checkbox
                          checked={selectedSuggestions.includes(suggestion.keyword)}
                          onCheckedChange={(checked) => toggleSuggestion(suggestion.keyword, checked)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{suggestion.keyword}</span>
                            <Badge variant="secondary" className="text-xs">
                              {Math.round(suggestion.confidence * 100)}% match
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{suggestion.rationale}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSuggestionPreview(false)}>
                    Cancel
                  </Button>
                  <Button onClick={addSelectedSuggestions}>
                    Add {selectedSuggestions.length} Keyword{selectedSuggestions.length !== 1 ? 's' : ''}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Step 5: Audience */}
          {currentStep === 5 && (
            <div className="space-y-6 text-center">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold">Who's your audience?</h2>
                <p className="text-lg text-muted-foreground">
                  This helps tailor the content style
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                {[
                  { value: 'beginner', emoji: '🎯', title: 'General Audience', desc: 'Clear explanations, more context' },
                  { value: 'intermediate', emoji: '🔧', title: 'Some Expertise', desc: 'Balanced technical depth' },
                  { value: 'expert', emoji: '🧠', title: 'Expert Level', desc: 'Technical terminology, advanced insights' }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormData({ ...formData, audience_expertise: option.value as any })}
                    className={`p-6 rounded-lg border-2 transition-all hover:shadow-md ${
                      formData.audience_expertise === option.value
                        ? 'border-primary bg-accent'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <div className="text-4xl mb-3">{option.emoji}</div>
                    <h3 className="font-semibold mb-2">{option.title}</h3>
                    <p className="text-sm text-muted-foreground">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-muted-foreground"
          >
            Cancel
          </Button>

          {currentStep < STEPS.length ? (
            <Button
              onClick={nextStep}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!canProceed() || creating}
            >
              {creating ? 'Creating...' : 'Create Topic'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};