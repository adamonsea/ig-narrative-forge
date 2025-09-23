import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Globe, Hash, MapPin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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
  
  const { toast } = useToast();
  const { user } = useAuth();

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

  const clearDraft = () => {
    if (user) {
      localStorage.removeItem(`topic-draft-${user.id}`);
    }
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
      case 2: return formData.topic_type === 'keyword' || formData.topic_type === 'regional';
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
    onOpenChange(false);
  };

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create New Topic</DialogTitle>
          <div className="flex items-center gap-2 mt-4">
            <Progress value={progress} className="flex-1" />
            <span className="text-sm font-medium text-muted-foreground">
              {currentStep} of {STEPS.length}
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
                  className={`p-8 rounded-lg border-2 transition-all ${
                    formData.topic_type === 'keyword'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Hash className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-xl font-semibold mb-2">Interest Topic</h3>
                  <p className="text-muted-foreground">Based on keywords and themes</p>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, topic_type: 'regional' })}
                  className={`p-8 rounded-lg border-2 transition-all ${
                    formData.topic_type === 'regional'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <MapPin className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-xl font-semibold mb-2">Local News</h3>
                  <p className="text-muted-foreground">Location-based content</p>
                </button>
              </div>
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
            <div className="space-y-6 text-center">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold">What keywords describe your topic?</h2>
                <p className="text-lg text-muted-foreground">
                  Add words that help find relevant content
                </p>
              </div>
              <div className="max-w-xl mx-auto">
                <div className="flex gap-2 mb-4">
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
                  <p className="text-muted-foreground text-sm">No keywords added yet</p>
                )}
              </div>
            </div>
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
                    className={`p-6 rounded-lg border-2 transition-all ${
                      formData.audience_expertise === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
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
              className="bg-primary hover:bg-primary/90"
            >
              {creating ? 'Creating...' : 'Create Topic'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};