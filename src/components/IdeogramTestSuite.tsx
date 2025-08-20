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
  const [progress, setProgress] = useState(0);
  const [styleReferenceUrl, setStyleReferenceUrl] = useState('');
  const [styleReferenceFile, setStyleReferenceFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedSlideForViewing, setSelectedSlideForViewing] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [deletingVisuals, setDeletingVisuals] = useState<Set<string>>(new Set());

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

  const runSingleSlideTest = async (slide: Slide, apiProvider: 'openai' | 'ideogram' | 'fal' | 'replicate') => {
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
    setProgress(0);

    try {
      // Test OpenAI
      setProgress(25);
      const openaiResult = await runSingleSlideTest(slide, 'openai');
      
      setProgress(75);
      // Test Ideogram
      const ideogramResult = await runSingleSlideTest(slide, 'ideogram');
      
      setProgress(100);
      
      if (openaiResult && ideogramResult) {
        toast.success(`Comparison complete! OpenAI: $${openaiResult.estimatedCost}, Ideogram: $${ideogramResult.estimatedCost}`);
      } else {
        toast.error('Some comparison tests failed - check individual results');
      }
      
    } catch (error) {
      toast.error('Comparison test failed');
    } finally {
      setIsRunning(false);
      setProgress(0);
    }
  };

  const runStoryTest = async (story: Story, apiProvider: 'openai' | 'ideogram' | 'fal' | 'replicate') => {
    setIsRunning(true);
    setProgress(0);
    
    const totalSlides = story.slides.length;
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
        setProgress((completedSlides / totalSlides) * 100);
      }

      const successCount = results.length;
      toast.success(`Story test complete! ${successCount}/${completedSlides} slides generated successfully. Total cost: $${totalCost.toFixed(4)}`);
    } catch (error) {
      toast.error('Story test failed');
    } finally {
      setIsRunning(false);
      setProgress(0);
    }
  };

  const deleteVisual = async (visualId: string, slideId: string) => {
    if (!visualId) return;
    
    setDeletingVisuals(prev => new Set([...prev, visualId]));
    
    try {
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
      // First delete associated visuals for this slide
      const { error: visualsError } = await supabase
        .from('visuals')
        .delete()
        .eq('slide_id', slideId);
        
      if (visualsError) {
        console.error('Error deleting visuals during archive:', visualsError);
        toast.error('Failed to delete associated images');
        return;
      }
      
      // Then delete the test result
      const { error: testError } = await supabase
        .from('image_generation_tests')
        .delete()
        .eq('id', testId);
        
      if (testError) {
        console.error('Error archiving test result:', testError);
        toast.error('Failed to archive test result');
        return;
      }
      
      // Refresh data
      await Promise.all([loadStories(), loadTestResults()]);
      toast.success('Test result archived and images deleted');
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
      // Get all unique slide IDs from test results
      const slideIds = [...new Set(testResults.map(test => test.slide_id).filter(Boolean))];
      
      // Delete all visuals for these slides
      if (slideIds.length > 0) {
        const { error: visualsError } = await supabase
          .from('visuals')
          .delete()
          .in('slide_id', slideIds);
          
        if (visualsError) {
          console.error('Error deleting visuals during bulk archive:', visualsError);
          toast.error('Failed to delete associated images');
          return;
        }
      }
      
      // Delete all test results
      const { error: testsError } = await supabase
        .from('image_generation_tests')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
        
      if (testsError) {
        console.error('Error archiving all test results:', testsError);
        toast.error('Failed to archive test results');
        return;
      }
      
      // Refresh data
      await Promise.all([loadStories(), loadTestResults()]);
      toast.success(`Archived all test results and deleted ${slideIds.length} associated images`);
    } catch (error) {
      console.error('Error archiving all tests:', error);
      toast.error('Failed to archive all tests');
    }
  };

  const calculateStats = () => {
    if (testResults.length === 0) return null;

    const openaiResults = testResults.filter(r => r.api_provider === 'openai');
    const ideogramResults = testResults.filter(r => r.api_provider === 'ideogram');
    const falResults = testResults.filter(r => r.api_provider === 'fal');

    const avgOpenaiCost = openaiResults.length > 0 
      ? openaiResults.reduce((sum, r) => sum + r.estimated_cost, 0) / openaiResults.length 
      : 0;
    
    const avgIdeogramCost = ideogramResults.length > 0 
      ? ideogramResults.reduce((sum, r) => sum + r.estimated_cost, 0) / ideogramResults.length 
      : 0;

    const avgFalCost = falResults.length > 0 
      ? falResults.reduce((sum, r) => sum + r.estimated_cost, 0) / falResults.length 
      : 0;

    const avgOpenaiTime = openaiResults.length > 0
      ? openaiResults.reduce((sum, r) => sum + r.generation_time_ms, 0) / openaiResults.length
      : 0;

    const avgIdeogramTime = ideogramResults.length > 0
      ? ideogramResults.reduce((sum, r) => sum + r.generation_time_ms, 0) / ideogramResults.length
      : 0;

    const avgFalTime = falResults.length > 0
      ? falResults.reduce((sum, r) => sum + r.generation_time_ms, 0) / falResults.length
      : 0;

    return {
      openai: {
        count: openaiResults.length,
        avgCost: avgOpenaiCost,
        avgTime: avgOpenaiTime,
        successRate: openaiResults.filter(r => r.success).length / openaiResults.length * 100
      },
      ideogram: {
        count: ideogramResults.length,
        avgCost: avgIdeogramCost,
        avgTime: avgIdeogramTime,
        successRate: ideogramResults.filter(r => r.success).length / ideogramResults.length * 100
      },
      fal: {
        count: falResults.length,
        avgCost: avgFalCost,
        avgTime: avgFalTime,
        successRate: falResults.filter(r => r.success).length / falResults.length * 100
      }
    };
  };

  const stats = calculateStats();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Image gen tests</h1>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <Progress value={progress} className="w-32" />
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="test" className="space-y-4">
        <TabsList>
          <TabsTrigger value="test">Run Tests</TabsTrigger>
          <TabsTrigger value="results">Image gen tests</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="space-y-6">
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
              <CardDescription>Configure your test parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="styleRef">Style Reference URL (Optional)</Label>
                  <Input
                    id="styleRef"
                    placeholder="https://example.com/reference-image.jpg"
                    value={styleReferenceUrl}
                    onChange={(e) => setStyleReferenceUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customPrompt">Custom Prompt (Optional)</Label>
                  <Textarea
                    id="customPrompt"
                    placeholder="Override slide prompts with custom text..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="styleFile">Upload Style Reference Image</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="styleFile"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setStyleReferenceFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                  {styleReferenceFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStyleReferenceFile(null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                 <p className="text-xs text-muted-foreground">
                   Upload an image to use as style reference (supported by Ideogram, Fal.ai and Replicate)
                 </p>
                
                {styleReferenceFile && (
                  <div className="mt-2">
                    <img
                      src={URL.createObjectURL(styleReferenceFile)}
                      alt="Style reference preview"
                      className="h-20 w-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Story Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Story to Test</CardTitle>
              <CardDescription>Choose a completed story with slides</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {stories.map(story => (
                  <div 
                    key={story.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedStory?.id === story.id 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:border-border/50'
                    }`}
                    onClick={() => setSelectedStory(story)}
                  >
                     <div className="flex items-center justify-between">
                       <div>
                         <h3 className="font-medium">{story.title}</h3>
                         <p className="text-sm text-muted-foreground">
                           {story.slides.length} slides • Status: {story.status}
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

          {/* Test Actions */}
          {selectedStory && (
            <Card>
              <CardHeader>
                <CardTitle>Test Actions</CardTitle>
                <CardDescription>
                  Testing "{selectedStory.title}" with {selectedStory.slides.length} slides
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Single slide tests */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Single Slide Tests</h4>
                    {selectedStory.slides.slice(0, 3).map(slide => (
                        <div key={slide.id} className="p-3 border rounded">
                          <p className="text-sm mb-2">Slide {slide.slide_number}: {slide.content.substring(0, 60)}...</p>
                          <div className="flex gap-2 flex-wrap mb-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runSingleSlideTest(slide, 'openai')}
                              disabled={isRunning}
                            >
                              <ImageIcon className="h-4 w-4 mr-1" />
                              OpenAI
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runSingleSlideTest(slide, 'ideogram')}
                              disabled={isRunning}
                            >
                              <Zap className="h-4 w-4 mr-1" />
                              Ideogram
                            </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={() => runSingleSlideTest(slide, 'fal')}
                               disabled={isRunning}
                             >
                               <Sparkles className="h-4 w-4 mr-1" />
                               Fal.ai
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={() => runSingleSlideTest(slide, 'replicate')}
                               disabled={isRunning}
                             >
                               <Sparkles className="h-4 w-4 mr-1" />
                               Flux
                             </Button>
                             <Button
                               size="sm"
                               onClick={() => runComparisonTest(slide)}
                               disabled={isRunning}
                             >
                               <BarChart3 className="h-4 w-4 mr-1" />
                               Compare
                             </Button>
                           </div>
                          
                          {/* Show generated visuals for this slide */}
                          {slide.visuals && slide.visuals.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {slide.visuals.slice(0, 3).map((visual) => (
                                <div key={visual.id} className="relative">
                                  <img
                                    src={visual.image_data ? `data:image/jpeg;base64,${visual.image_data}` : visual.image_url}
                                    alt={visual.alt_text || 'Generated visual'}
                                    className="w-12 h-12 object-cover rounded border cursor-pointer hover:scale-110 transition-transform"
                                    onClick={() => {
                                      if (visual.image_data) {
                                        window.open(`data:image/jpeg;base64,${visual.image_data}`, '_blank');
                                      } else if (visual.image_url) {
                                        window.open(visual.image_url, '_blank');
                                      }
                                    }}
                                  />
                                  <Badge className="absolute -top-1 -right-1 text-xs px-1" variant="secondary">
                                    {visual.style_preset}
                                  </Badge>
                                </div>
                              ))}
                              {slide.visuals.length > 3 && (
                                <div className="w-12 h-12 border rounded flex items-center justify-center text-xs text-muted-foreground">
                                  +{slide.visuals.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                    ))}
                  </div>

                  {/* Full story tests */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Full Story Tests</h4>
                    <div className="p-3 border rounded">
                      <p className="text-sm mb-3">Generate all {selectedStory.slides.length} slides</p>
                       <div className="space-y-2">
                         <Button
                           className="w-full"
                           onClick={() => runStoryTest(selectedStory, 'openai')}
                           disabled={isRunning}
                         >
                           <ImageIcon className="h-4 w-4 mr-2" />
                           Full OpenAI Test
                         </Button>
                         <Button
                           className="w-full"
                           onClick={() => runStoryTest(selectedStory, 'ideogram')}
                           disabled={isRunning}
                         >
                           <Zap className="h-4 w-4 mr-2" />
                           Full Ideogram Test
                         </Button>
                          <Button
                            className="w-full"
                            onClick={() => runStoryTest(selectedStory, 'fal')}
                            disabled={isRunning}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Full Fal.ai Test
                          </Button>
                          <Button
                            className="w-full"
                            onClick={() => runStoryTest(selectedStory, 'replicate')}
                            disabled={isRunning}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Full Flux Test
                          </Button>
                        </div>
                     </div>
                   </div>
                 </div>
               </CardContent>
             </Card>
           )}
         </TabsContent>

         <TabsContent value="results" className="space-y-4">
           <Card>
             <CardHeader>
               <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Image gen tests</CardTitle>
                    <CardDescription>Latest image generation tests with visual previews</CardDescription>
                 </div>
                 {testResults.length > 0 && (
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={archiveAllTests}
                     className="text-destructive hover:text-destructive"
                   >
                     <ArchiveX className="h-4 w-4 mr-1" />
                     Archive All ({testResults.length})
                   </Button>
                 )}
               </div>
             </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {testResults.slice(0, 20).map(result => {
                  // Find the slide and its visuals for this test result
                  const relatedStory = stories.find(story => story.id === result.story_id);
                  const relatedSlide = relatedStory?.slides.find(slide => slide.id === result.slide_id);
                  
                  return (
                    <div key={result.id} className="border rounded-lg">
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          {result.success ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                               <Badge variant={
                                 result.api_provider === 'openai' ? 'default' : 
                                 result.api_provider === 'ideogram' ? 'secondary' :
                                 result.api_provider === 'fal' ? 'secondary' :
                                 result.api_provider === 'replicate' ? 'default' : 'outline'
                               }>
                                 {result.api_provider === 'replicate' ? 'FLUX' : 
                                  result.api_provider === 'fal' ? 'FAL.AI' : 
                                  result.api_provider.toUpperCase()}
                              </Badge>
                              <span className="text-sm font-medium">
                                {relatedStory?.title?.substring(0, 50) || `Slide ${result.slide_id.substring(0, 8)}`}...
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Slide {relatedSlide?.slide_number || '?'} • {new Date(result.created_at).toLocaleString()}
                            </p>
                            {result.error_message && (
                              <p className="text-xs text-red-500">{result.error_message}</p>
                            )}
                          </div>
                        </div>
                         <div className="flex items-center gap-4 text-sm">
                           <div className="flex items-center gap-1">
                             <DollarSign className="h-4 w-4" />
                             ${result.estimated_cost?.toFixed(4)}
                           </div>
                           <div className="flex items-center gap-1">
                             <Clock className="h-4 w-4" />
                             {(result.generation_time_ms / 1000).toFixed(1)}s
                           </div>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => archiveTestResult(result.id, result.slide_id || '')}
                             className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                           >
                             <Archive className="h-3 w-3" />
                           </Button>
                         </div>
                      </div>
                      
                      {/* Show slide content and generated visuals */}
                      {relatedSlide && (
                        <div className="px-3 pb-3 border-t bg-muted/20">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-muted-foreground py-2 flex-1">
                              "{relatedSlide.content.substring(0, 100)}..."
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {relatedSlide.visuals.length} visual{relatedSlide.visuals.length !== 1 ? 's' : ''}
                              </span>
                              {relatedSlide.visuals.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedSlideForViewing(relatedSlide.id)}
                                  className="h-6 px-2 text-xs"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View All
                                </Button>
                              )}
                            </div>
                          </div>
                          
                           {relatedSlide.visuals && relatedSlide.visuals.length > 0 && (
                             <div>
                               <div className="flex items-center justify-between mb-2">
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => {
                                     const newExpanded = new Set(expandedResults);
                                     if (expandedResults.has(result.id)) {
                                       newExpanded.delete(result.id);
                                     } else {
                                       newExpanded.add(result.id);
                                     }
                                     setExpandedResults(newExpanded);
                                   }}
                                   className="justify-between h-6 text-xs flex-1"
                                 >
                                   <span>Generated Images ({relatedSlide.visuals.length})</span>
                                   <span>{expandedResults.has(result.id) ? '−' : '+'}</span>
                                 </Button>
                                 {relatedSlide.visuals.length > 1 && (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => deleteAllSlideVisuals(relatedSlide.id)}
                                     className="h-6 px-2 text-xs ml-2 text-destructive hover:text-destructive"
                                   >
                                     <Trash2 className="h-3 w-3" />
                                   </Button>
                                 )}
                               </div>
                              
                              {expandedResults.has(result.id) ? (
                                <div className="grid grid-cols-3 gap-2">
                                   {relatedSlide.visuals.map((visual) => (
                                     <div key={visual.id} className="relative group">
                                       {visual.image_data || visual.image_url ? (
                                         <div className="relative">
                                           <img
                                             src={visual.image_data ? `data:image/jpeg;base64,${visual.image_data}` : visual.image_url}
                                             alt={visual.alt_text || 'Generated visual'}
                                             className="w-full h-16 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                             onClick={() => {
                                               if (visual.image_data) {
                                                 window.open(`data:image/jpeg;base64,${visual.image_data}`, '_blank');
                                               } else if (visual.image_url) {
                                                 window.open(visual.image_url, '_blank');
                                               }
                                             }}
                                             onError={(e) => {
                                               console.error('Failed to load visual:', visual);
                                               e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEw0NCA0NG0wLTI0TDIwIDQ0IiBzdHJva2U9IiM5Q0EzQUYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPgo=';
                                             }}
                                           />
                                           <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center gap-1">
                                             <Button
                                               variant="ghost"
                                               size="sm"
                                               onClick={(e) => {
                                                 e.stopPropagation();
                                                 if (visual.image_data) {
                                                   window.open(`data:image/jpeg;base64,${visual.image_data}`, '_blank');
                                                 } else if (visual.image_url) {
                                                   window.open(visual.image_url, '_blank');
                                                 }
                                               }}
                                               className="h-5 w-5 p-0 text-white hover:text-white hover:bg-black/30"
                                             >
                                               <ExternalLink className="h-3 w-3" />
                                             </Button>
                                             <Button
                                               variant="ghost"
                                               size="sm"
                                               disabled={deletingVisuals.has(visual.id)}
                                               onClick={(e) => {
                                                 e.stopPropagation();
                                                 deleteVisual(visual.id, relatedSlide.id);
                                               }}
                                               className="h-5 w-5 p-0 text-white hover:text-red-300 hover:bg-red-500/30"
                                             >
                                               {deletingVisuals.has(visual.id) ? (
                                                 <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                                               ) : (
                                                 <Trash2 className="h-3 w-3" />
                                               )}
                                             </Button>
                                           </div>
                                         </div>
                                       ) : (
                                         <div className="w-full h-16 bg-muted border rounded flex items-center justify-center">
                                           <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                         </div>
                                       )}
                                       <Badge className="absolute top-1 right-1 text-xs px-1" variant="secondary">
                                         {visual.style_preset || 'def'}
                                       </Badge>
                                     </div>
                                   ))}
                                 </div>
                              ) : (
                                <div className="flex gap-2 flex-wrap">
                                  {relatedSlide.visuals.slice(0, 4).map((visual) => (
                                    <div key={visual.id} className="relative group">
                                      {visual.image_data || visual.image_url ? (
                                        <img
                                          src={visual.image_data ? `data:image/jpeg;base64,${visual.image_data}` : visual.image_url}
                                          alt={visual.alt_text || 'Generated visual'}
                                          className="w-16 h-16 object-cover rounded border cursor-pointer hover:scale-110 transition-transform"
                                          onClick={() => {
                                            if (visual.image_data) {
                                              window.open(`data:image/jpeg;base64,${visual.image_data}`, '_blank');
                                            } else if (visual.image_url) {
                                              window.open(visual.image_url, '_blank');
                                            }
                                          }}
                                          onError={(e) => {
                                            console.error('Failed to load visual:', visual);
                                            e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEw0NCA0NG0wLTI0TDIwIDQ0IiBzdHJva2U9IiM5Q0EzQUYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPgo=';
                                          }}
                                        />
                                      ) : (
                                        <div className="w-16 h-16 bg-muted border rounded flex items-center justify-center">
                                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                      )}
                                      <Badge className="absolute -bottom-1 -right-1 text-xs px-1" variant="secondary">
                                        {visual.style_preset || 'def'}
                                      </Badge>
                                    </div>
                                  ))}
                                  {relatedSlide.visuals.length > 4 && (
                                    <div className="w-16 h-16 border rounded flex items-center justify-center text-xs text-muted-foreground bg-muted">
                                      +{relatedSlide.visuals.length - 4}
                                    </div>
                                  )}
                                </div>
                              )}
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
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* OpenAI Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    OpenAI Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests Run</p>
                      <p className="text-2xl font-bold">{stats.openai.count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold">{stats.openai.successRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Cost</p>
                      <p className="text-2xl font-bold">${stats.openai.avgCost.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Time</p>
                      <p className="text-2xl font-bold">{(stats.openai.avgTime / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Ideogram Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Ideogram Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests Run</p>
                      <p className="text-2xl font-bold">{stats.ideogram.count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold">{stats.ideogram.successRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Cost</p>
                      <p className="text-2xl font-bold">${stats.ideogram.avgCost.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Time</p>
                      <p className="text-2xl font-bold">{(stats.ideogram.avgTime / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fal.ai Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Fal.ai Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests Run</p>
                      <p className="text-2xl font-bold">{stats.fal.count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold">{stats.fal.successRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Cost</p>
                      <p className="text-2xl font-bold">${stats.fal.avgCost.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Time</p>
                      <p className="text-2xl font-bold">{(stats.fal.avgTime / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Cost Comparison */}
          {stats && (stats.openai.count > 0 || stats.ideogram.count > 0 || stats.fal.count > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">OpenAI Cost per Slide</p>
                    <p className="text-2xl font-bold text-blue-600">${stats.openai.avgCost.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ideogram Cost per Slide</p>
                    <p className="text-2xl font-bold text-purple-600">${stats.ideogram.avgCost.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fal.ai Cost per Slide</p>
                    <p className="text-2xl font-bold text-green-600">${stats.fal.avgCost.toFixed(4)}</p>
                  </div>
                </div>
                
                {/* Cost Winner */}
                {stats.fal.count > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-center">
                      💡 <strong>Most Cost-Effective:</strong> {
                        Math.min(
                          stats.openai.count > 0 ? stats.openai.avgCost : Infinity,
                          stats.ideogram.count > 0 ? stats.ideogram.avgCost : Infinity,
                          stats.fal.count > 0 ? stats.fal.avgCost : Infinity
                        ) === stats.fal.avgCost 
                          ? "Fal.ai" 
                          : Math.min(stats.openai.avgCost, stats.ideogram.avgCost) === stats.ideogram.avgCost 
                          ? "Ideogram" 
                          : "OpenAI"
                      }
                    </p>
                  </div>
                )}

                {/* Monthly projections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Cost per 5-slide Story</p>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">OpenAI: ${(stats.openai.avgCost * 5).toFixed(3)}</p>
                      <p className="text-lg font-semibold">Ideogram: ${(stats.ideogram.avgCost * 5).toFixed(3)}</p>
                      <p className="text-lg font-semibold">Fal.ai: ${(stats.fal.avgCost * 5).toFixed(3)}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Monthly Cost (100 stories)</p>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">OpenAI: ${(stats.openai.avgCost * 5 * 100).toFixed(2)}</p>
                      <p className="text-lg font-semibold">Ideogram: ${(stats.ideogram.avgCost * 5 * 100).toFixed(2)}</p>
                      <p className="text-lg font-semibold">Fal.ai: ${(stats.fal.avgCost * 5 * 100).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Speed Comparison</p>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">OpenAI: {(stats.openai.avgTime / 1000).toFixed(1)}s</p>
                      <p className="text-lg font-semibold">Ideogram: {(stats.ideogram.avgTime / 1000).toFixed(1)}s</p>
                      <p className="text-lg font-semibold">Fal.ai: {(stats.fal.avgTime / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
           )}
        </TabsContent>
      </Tabs>

      {/* Slide Viewer Dialog */}
      {selectedSlideForViewing && (
        <Dialog open={!!selectedSlideForViewing} onOpenChange={() => setSelectedSlideForViewing(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Slide Visuals</DialogTitle>
              <DialogDescription>
                View and manage all generated visuals for this slide
              </DialogDescription>
            </DialogHeader>
            <SlideViewer slideId={selectedSlideForViewing} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}