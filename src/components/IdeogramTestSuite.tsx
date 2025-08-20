import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import SlideViewer from './SlideViewer';
import { 
  Play, 
  Zap, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Image as ImageIcon,
  BarChart3,
  ExternalLink,
  Sparkles,
  Eye,
  Trash2,
  Upload,
  Archive,
  ArchiveX
} from 'lucide-react';

interface Story {
  id: string;
  title: string;
  status: string;
  slides: Slide[];
  article?: {
    id: string;
    source_url: string;
    title: string;
  };
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string;
  visuals: Visual[];
}

interface Visual {
  id: string;
  image_url?: string;
  image_data?: string;
  alt_text?: string;
  style_preset?: string;
  generation_prompt?: string;
}

interface TestResult {
  id: string;
  test_id: string;
  slide_id: string;
  story_id: string;
  api_provider: string;
  generation_time_ms: number;
  estimated_cost: number;
  style_reference_used: boolean;
  success: boolean;
  error_message?: string;
  created_at: string;
  visual_id?: string;
  visual?: {
    id: string;
    image_data?: string;
    image_url?: string;
    alt_text?: string;
    style_preset?: string;
  };
}

export default function IdeogramTestSuite() {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [styleReferenceUrl, setStyleReferenceUrl] = useState('');
  const [styleReferenceFile, setStyleReferenceFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedSlideForViewing, setSelectedSlideForViewing] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [deletingVisuals, setDeletingVisuals] = useState<Set<string>>(new Set());
  const [providerCosts] = useState({
    openai: { cost: 0.04, name: 'DALL-E 3 (OpenAI)' },
    ideogram: { cost: 0.08, name: 'Ideogram 2.0' },
    fal: { cost: 0.05, name: 'Recraft V3 (Fal.ai)' },
    replicate: { cost: 0.035, name: 'SD 3.5 Large (Replicate)' },
    huggingface: { cost: 0.02, name: 'FLUX.1-schnell (HuggingFace)' },
    deepinfra: { cost: 0.025, name: 'SDXL (DeepInfra)' }
  });

  useEffect(() => {
    loadStories();
    loadTestResults();
  }, []);

  const loadStories = async () => {
    try {
      const { data: storiesData, error } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          status,
          article:articles(
            id,
            source_url,
            title
          ),
          slides!inner(
            id,
            slide_number,
            content,
            visual_prompt,
            visuals(
              id,
              image_url,
              alt_text,
              style_preset
            )
          )
        `)
        .in('status', ['ready', 'completed', 'approved'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setStories(storiesData || []);
    } catch (error) {
      console.error('Error loading stories:', error);
      toast.error('Failed to load stories');
    }
  };

  const loadTestResults = async () => {
    try {
      const { data, error } = await supabase
        .from('image_generation_tests')
        .select(`
          *,
          visual:visuals(
            id,
            image_data,
            image_url,
            alt_text,
            style_preset
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTestResults(data || []);
    } catch (error) {
      console.error('Error loading test results:', error);
    }
  };

  const generateEditorialPrompt = (slide: Slide) => {
    const basePrompt = "Editorial style social media illustration, clean and professional, flat design with bold typography:";
    const contentSummary = slide.content.length > 80 ? 
      slide.content.substring(0, 80) + "..." : 
      slide.content;
    
    // Generate contextual prompt based on slide number and content
    if (slide.slide_number === 1) {
      return `${basePrompt} Eye-catching hook visual for "${contentSummary}". Bold header design, attention-grabbing colors, news-style layout.`;
    } else if (slide.slide_number <= 3) {
      return `${basePrompt} Supporting information graphic for "${contentSummary}". Clear infographic style, data visualization elements, professional news design.`;
    } else {
      return `${basePrompt} Conclusion or call-to-action visual for "${contentSummary}". Engaging summary design, social media optimized, editorial branding.`;
    }
  };

  const runSingleSlideTest = async (slide: Slide, apiProvider: 'openai' | 'ideogram' | 'fal' | 'replicate' | 'huggingface' | 'deepinfra') => {
    const testId = crypto.randomUUID();
    
    // Handle style reference image upload if file is provided
    let finalStyleReferenceUrl = styleReferenceUrl;
    
    if (styleReferenceFile && apiProvider !== 'openai') {
      try {
        // Upload style reference to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('visuals')
          .upload(`style-references/${testId}-${styleReferenceFile.name}`, styleReferenceFile);
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('visuals')
          .getPublicUrl(uploadData.path);
        
        finalStyleReferenceUrl = urlData.publicUrl;
        console.log('Style reference uploaded:', finalStyleReferenceUrl);
      } catch (error) {
        console.error('Failed to upload style reference:', error);
        // Continue without style reference
      }
    }

    const prompt = customPrompt || generateEditorialPrompt(slide);

    try {
      console.log(`Running ${apiProvider} test for slide ${slide.id}`);
      
      const { data, error } = await supabase.functions.invoke('test-image-generator', {
        body: {
          slideId: slide.id,
          prompt,
          apiProvider,
          stylePreset: 'editorial',
          styleReferenceUrl: finalStyleReferenceUrl || null,
          testId
        }
      });

      console.log('Function response:', { data, error });

      if (error) {
        console.error(`${apiProvider} function error:`, error);
        toast.error(`${apiProvider.toUpperCase()} generation failed: ${error.message || 'Function call failed'}`);
        return null;
      }

      if (!data?.success) {
        console.error(`${apiProvider} generation failed:`, data);
        toast.error(`${apiProvider.toUpperCase()} generation failed: ${data?.error || 'Generation failed'}`);
        return null;
      }

      toast.success(`${apiProvider === 'replicate' ? 'FLUX' : apiProvider.toUpperCase()} generation completed! Cost: $${data.estimatedCost}`);
      
    // Reload data after successful generation
    loadTestResults();
      
      return data;
    } catch (error) {
      console.error(`${apiProvider} test failed:`, error);
      
      // Enhanced error message with more details
      const errorMessage = error.message || 'Unknown error occurred';
      toast.error(`${apiProvider === 'replicate' ? 'FLUX' : apiProvider.toUpperCase()} generation failed: ${errorMessage}`);
      return null;
    }
  };

  const runComparisonTest = async (slide: Slide) => {
    setIsRunning(true);
    setProgress({ current: 0, total: 2 });

    try {
      // Test OpenAI
      setProgress({ current: 1, total: 2 });
      const openaiResult = await runSingleSlideTest(slide, 'openai');
      
      // Test Ideogram
      setProgress({ current: 2, total: 2 });
      const ideogramResult = await runSingleSlideTest(slide, 'ideogram');
      
      if (openaiResult && ideogramResult) {
        toast.success(`Comparison complete! OpenAI: $${openaiResult.estimatedCost}, Ideogram: $${ideogramResult.estimatedCost}`);
      } else {
        toast.error('Some comparison tests failed - check individual results');
      }
      
    } catch (error) {
      toast.error('Comparison test failed');
    } finally {
      setIsRunning(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const runStoryTest = async (story: Story, apiProvider: 'openai' | 'ideogram' | 'fal' | 'replicate' | 'huggingface' | 'deepinfra') => {
    setIsRunning(true);
    setProgress({ current: 0, total: story.slides.length });
    
    let completedSlides = 0;
    let totalCost = 0;
    const results = [];

    try {
      for (const slide of story.slides) {
        const result = await runSingleSlideTest(slide, apiProvider);
        if (result) {
          results.push(result);
          totalCost += result.estimatedCost;
        }
        completedSlides++;
        setProgress({ current: completedSlides, total: story.slides.length });
      }

      const successCount = results.length;
      toast.success(`Story test complete! ${successCount}/${completedSlides} slides generated successfully. Total cost: $${totalCost.toFixed(4)}`);
    } catch (error) {
      toast.error('Story test failed');
    } finally {
      setIsRunning(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const deleteVisual = async (visualId: string, slideId: string) => {
    if (!visualId) return;
    
    setDeletingVisuals(prev => new Set([...prev, visualId]));
    
    try {
      // First, delete any test results that reference this visual
      const { error: testError } = await supabase
        .from('image_generation_tests')
        .delete()
        .eq('visual_id', visualId);
        
      if (testError) {
        console.error('Error deleting test results:', testError);
        toast.warning('Could not delete related test results');
      }
      
      // Then delete the visual
      const { error } = await supabase
        .from('visuals')
        .delete()
        .eq('id', visualId);
        
      if (error) {
        console.error('Error deleting visual:', error);
        toast.error('Failed to delete visual');
        return;
      }
      
      // Refresh data
      await Promise.all([loadStories(), loadTestResults()]);
      toast.success('Visual deleted successfully');
    } catch (error) {
      console.error('Error deleting visual:', error);
      toast.error('Failed to delete visual');
    } finally {
      setDeletingVisuals(prev => {
        const newSet = new Set(prev);
        newSet.delete(visualId);
        return newSet;
      });
    }
  };

  const deleteAllSlideVisuals = async (slideId: string) => {
    if (!slideId) return;
    
    try {
      const { error } = await supabase
        .from('visuals')
        .delete()
        .eq('slide_id', slideId);
        
      if (error) {
        console.error('Error deleting slide visuals:', error);
        toast.error('Failed to delete visuals');
        return;
      }
      
      // Refresh data
      await Promise.all([loadStories(), loadTestResults()]);
      toast.success('All slide visuals deleted successfully');
    } catch (error) {
      console.error('Error deleting slide visuals:', error);
      toast.error('Failed to delete visuals');
    }
  };

  const archiveTestResult = async (testId: string, slideId: string) => {
    if (!testId) return;
    
    try {
      // First get the test result to find the specific visual ID
      const { data: testResult, error: fetchError } = await supabase
        .from('image_generation_tests')
        .select('visual_id')
        .eq('id', testId)
        .maybeSingle();
        
      if (fetchError) {
        console.error('Error fetching test result:', fetchError);
        toast.error('Failed to fetch test result');
        return;
      }
      
      // Delete the test result first (this removes the foreign key reference)
      const { error: testError } = await supabase
        .from('image_generation_tests')
        .delete()
        .eq('id', testId);
        
      if (testError) {
        console.error('Error archiving test result:', testError);
        toast.error('Failed to archive test result');
        return;
      }
      
      // Now delete the specific visual that was generated by this test (if it exists)
      if (testResult?.visual_id) {
        const { error: visualError } = await supabase
          .from('visuals')
          .delete()
          .eq('id', testResult.visual_id);
          
        if (visualError) {
          console.error('Error deleting visual:', visualError);
          // Don't return here - test was already deleted successfully
          toast.warning('Test archived but image deletion failed');
        }
      }
      
      // Refresh data
      await Promise.all([loadStories(), loadTestResults()]);
      toast.success('Test result archived and image deleted');
    } catch (error) {
      console.error('Error archiving test result:', error);
      toast.error('Failed to archive test result');
    }
  };

  const archiveAllTests = async () => {
    if (testResults.length === 0) return;
    
    const confirmArchive = window.confirm(
      `This will permanently delete all ${testResults.length} test results and their associated images. This action cannot be undone. Continue?`
    );
    
    if (!confirmArchive) return;
    
    try {
      // First delete all test results (this removes foreign key references)
      const { error: testsError } = await supabase
        .from('image_generation_tests')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all tests
        
      if (testsError) {
        console.error('Error deleting test results:', testsError);
        toast.error('Failed to delete test results');
        return;
      }
      
      // Then delete all visuals that are no longer referenced
      const { error: visualsError } = await supabase
        .from('visuals')
        .delete()
        .not('id', 'in', '(SELECT DISTINCT visual_id FROM image_generation_tests WHERE visual_id IS NOT NULL)');
        
      if (visualsError) {
        console.error('Error deleting orphaned visuals:', visualsError);
        // Don't return here - tests were already deleted successfully
        toast.warning('Tests archived but some images may remain');
      }
      
      // Refresh data
      await Promise.all([loadStories(), loadTestResults()]);
      toast.success(`All ${testResults.length} test results archived and images deleted`);
    } catch (error) {
      console.error('Error archiving all tests:', error);
      toast.error('Failed to archive all tests');
    }
  };

  const calculateStats = () => {
    const stats = Object.keys(providerCosts).reduce((acc, provider) => {
      acc[provider] = { count: 0, totalCost: 0, totalTime: 0, successes: 0 };
      return acc;
    }, {} as Record<string, { count: number; totalCost: number; totalTime: number; successes: number }>);

    testResults.forEach(result => {
      if (result.api_provider && stats[result.api_provider]) {
        const stat = stats[result.api_provider];
        stat.count++;
        stat.totalCost += result.estimated_cost || 0;
        stat.totalTime += result.generation_time_ms || 0;
        if (result.success) stat.successes++;
      }
    });

    return Object.entries(stats).map(([provider, stat]) => ({
      provider,
      name: providerCosts[provider]?.name || provider,
      ...stat,
      avgCost: stat.count > 0 ? stat.totalCost / stat.count : 0,
      avgTime: stat.count > 0 ? stat.totalTime / stat.count : 0,
      successRate: stat.count > 0 ? (stat.successes / stat.count) * 100 : 0,
    }));
  };

  const stats = calculateStats();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Image Generation Tests</h1>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <Progress value={(progress.current / progress.total) * 100} className="w-32" />
            <span className="text-sm text-muted-foreground">{progress.current}/{progress.total}</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="test" className="space-y-4">
        <TabsList>
          <TabsTrigger value="test">Run Tests</TabsTrigger>
          <TabsTrigger value="results">Test Results</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="space-y-6">
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Configure style reference and prompts for image generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="style-reference-url">Style Reference URL</Label>
                  <Input
                    id="style-reference-url"
                    placeholder="https://example.com/style-image.jpg"
                    value={styleReferenceUrl}
                    onChange={(e) => setStyleReferenceUrl(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="style-reference-file">Style Reference File</Label>
                  <div className="flex gap-2">
                    <Input
                      id="style-reference-file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setStyleReferenceFile(e.target.files?.[0] || null)}
                    />
                    {styleReferenceFile && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStyleReferenceFile(null)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="custom-prompt">Custom Prompt (optional)</Label>
                <Textarea
                  id="custom-prompt"
                  placeholder="Enter custom prompt to override default editorial prompts..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Story Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Story Selection</CardTitle>
              <CardDescription>Select a story to test image generation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stories.map(story => (
                  <div 
                    key={story.id} 
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedStory?.id === story.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedStory(story)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <h3 className="font-semibold">{story.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {story.article?.source_url && (
                            <span>Source: {new URL(story.article.source_url).hostname}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{story.slides.length} slides</Badge>
                        {story.article?.source_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(story.article.source_url, '_blank');
                            }}
                            title="View original article"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                 </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Provider Test */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Provider Test</CardTitle>
              <CardDescription>Test different providers on the first slide for quick comparison</CardDescription>
            </CardHeader>
            <CardContent>
              {stories.length > 0 && stories[0].slides.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Testing: "{stories[0].slides[0].content.substring(0, 60)}..."
                  </p>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
                    {Object.entries(providerCosts).map(([provider, info]) => (
                      <Button
                        key={provider}
                        onClick={() => runSingleSlideTest(stories[0].slides[0], provider as any)}
                        disabled={isRunning}
                        variant="outline"
                        className="flex flex-col items-center p-3 h-auto text-xs"
                      >
                        <span className="font-medium">{info.name}</span>
                        <span className="text-muted-foreground">${info.cost}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Actions */}
          {selectedStory && (
            <Card>
              <CardHeader>
                <CardTitle>Test Actions</CardTitle>
                <CardDescription>Run tests for the selected story: {selectedStory.title}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Individual Slide Tests */}
                <div className="space-y-4">
                  <h4 className="font-medium">Individual Slide Tests</h4>
                  {selectedStory.slides.map(slide => (
                    <div key={slide.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium">Slide {slide.slide_number}</h5>
                          <p className="text-sm text-muted-foreground">{slide.content.substring(0, 100)}...</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSlideForViewing(slide.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                        {Object.entries(providerCosts).map(([provider, info]) => (
                          <Button
                            key={provider}
                            size="sm"
                            variant="outline"
                            onClick={() => runSingleSlideTest(slide, provider as any)}
                            disabled={isRunning}
                            className="flex-1 text-xs"
                          >
                            {info.name.split(' ')[0]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Full Story Tests */}
                <div className="space-y-4">
                  <h4 className="font-medium">Full Story Tests</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(providerCosts).map(([provider, info]) => (
                      <Button
                        key={provider}
                        size="sm"
                        onClick={() => runStoryTest(selectedStory, provider as any)}
                        disabled={isRunning || !selectedStory}
                        className="flex-1 text-xs"
                      >
                        {info.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Recent Test Results</h3>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={archiveAllTests}
                disabled={testResults.length === 0}
              >
                <ArchiveX className="w-4 h-4 mr-2" />
                Archive All Tests
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {testResults.map((result) => {
                  const isExpanded = expandedResults.has(result.id);
                  const relatedSlide = stories
                    .flatMap(s => s.slides)
                    .find(slide => slide.id === result.slide_id);
                  const relatedStory = stories.find(s => s.id === result.story_id);

                  return (
                    <div key={result.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {result.success ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{result.api_provider.toUpperCase()}</Badge>
                              <span className="text-sm font-medium">
                                {relatedStory?.title.substring(0, 50)}...
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              <span>Slide {relatedSlide?.slide_number}</span>
                              <span>${result.estimated_cost.toFixed(4)}</span>
                              <span>{(result.generation_time_ms / 1000).toFixed(1)}s</span>
                              <span>{new Date(result.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newSet = new Set(expandedResults);
                              if (isExpanded) {
                                newSet.delete(result.id);
                              } else {
                                newSet.add(result.id);
                              }
                              setExpandedResults(newSet);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => archiveTestResult(result.id, result.slide_id)}
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 space-y-3 pl-8">
                          {result.error_message && (
                            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                              {result.error_message}
                            </div>
                          )}
                          
                          {result.visual && (result.visual.image_data || result.visual.image_url) && (
                            <div className="space-y-2">
                              <h5 className="text-sm font-medium">Generated Image ({providerCosts[result.api_provider as keyof typeof providerCosts]?.name || result.api_provider.toUpperCase()}):</h5>
                              <div className="relative inline-block">
                                <img
                                  src={result.visual.image_data 
                                    ? `data:image/jpeg;base64,${result.visual.image_data}` 
                                    : result.visual.image_url}
                                  alt={result.visual.alt_text || 'Generated image'}
                                  className="w-32 h-32 object-cover rounded border cursor-pointer hover:scale-105 transition-transform"
                                  onClick={() => {
                                    const imgSrc = result.visual.image_data 
                                      ? `data:image/jpeg;base64,${result.visual.image_data}` 
                                      : result.visual.image_url;
                                    window.open(imgSrc, '_blank');
                                  }}
                                />
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="absolute -top-2 -right-2 w-6 h-6 p-0"
                                  onClick={() => deleteVisual(result.visual_id!, result.slide_id)}
                                  disabled={deletingVisuals.has(result.visual_id!)}
                                >
                                  {deletingVisuals.has(result.visual_id!) ? (
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                          
                          {/* Show slide info but not all visuals together */}
                          {relatedSlide && (
                            <div className="space-y-2">
                              <h5 className="text-sm font-medium">Slide Content:</h5>
                              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                "{relatedSlide.content.substring(0, 200)}..."
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {testResults.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">No test results yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stats.map((providerStat) => (
              <Card key={providerStat.provider}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {providerStat.name} Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests Run</p>
                      <p className="text-2xl font-bold">{providerStat.count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold">{providerStat.successRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Cost</p>
                      <p className="text-2xl font-bold">${providerStat.avgCost.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Time</p>
                      <p className="text-2xl font-bold">{(providerStat.avgTime / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cost Analysis */}
          {stats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cost Comparison & Monthly Projections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stats.map((stat) => (
                      <div key={stat.provider} className="text-center p-4 border rounded">
                        <h4 className="font-medium">{stat.name}</h4>
                        <p className="text-2xl font-bold">${stat.avgCost.toFixed(4)}</p>
                        <p className="text-sm text-muted-foreground">per image</p>
                        <div className="mt-2 space-y-1">
                          <p className="text-xs">100 images/month: ${(stat.avgCost * 100).toFixed(2)}</p>
                          <p className="text-xs">1000 images/month: ${(stat.avgCost * 1000).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Slide Viewer Dialog */}
      <Dialog 
        open={!!selectedSlideForViewing} 
        onOpenChange={(open) => !open && setSelectedSlideForViewing(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Slide Visuals</DialogTitle>
            <DialogDescription>
              View all generated visuals for this slide
            </DialogDescription>
          </DialogHeader>
          {selectedSlideForViewing && (
            <SlideViewer 
              slideId={selectedSlideForViewing}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}