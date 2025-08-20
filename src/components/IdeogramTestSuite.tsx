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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  Sparkles
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
}

export default function IdeogramTestSuite() {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [styleReferenceUrl, setStyleReferenceUrl] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');

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
        .select('*')
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

  const runSingleSlideTest = async (slide: Slide, apiProvider: 'openai' | 'ideogram' | 'fal') => {
    const testId = crypto.randomUUID();
    const prompt = customPrompt || generateEditorialPrompt(slide);

    try {
      console.log(`Running ${apiProvider} test for slide ${slide.id}`);
      
      const { data, error } = await supabase.functions.invoke('test-image-generator', {
        body: {
          slideId: slide.id,
          prompt,
          apiProvider,
          stylePreset: 'editorial',
          styleReferenceUrl: styleReferenceUrl || null,
          testId
        }
      });

      console.log('Function response:', { data, error });

      if (error) {
        console.error(`${apiProvider} function error:`, error);
        throw new Error(error.message || 'Function call failed');
      }

      if (!data?.success) {
        console.error(`${apiProvider} generation failed:`, data);
        throw new Error(data?.error || 'Generation failed');
      }

      toast.success(`${apiProvider.toUpperCase()} generation completed! Cost: $${data.estimatedCost}`);
      
      // Reload data
      loadStories();
      loadTestResults();
      
      return data;
    } catch (error) {
      console.error(`${apiProvider} test failed:`, error);
      
      // Enhanced error message with more details
      const errorMessage = error.message || 'Unknown error occurred';
      toast.error(`${apiProvider.toUpperCase()} generation failed: ${errorMessage}`);
      throw error;
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
      
      toast.success(`Comparison complete! OpenAI: $${openaiResult.estimatedCost}, Ideogram: $${ideogramResult.estimatedCost}`);
      
    } catch (error) {
      toast.error('Comparison test failed');
    } finally {
      setIsRunning(false);
      setProgress(0);
    }
  };

  const runStoryTest = async (story: Story, apiProvider: 'openai' | 'ideogram' | 'fal') => {
    setIsRunning(true);
    setProgress(0);
    
    const totalSlides = story.slides.length;
    let completedSlides = 0;
    let totalCost = 0;
    const results = [];

    try {
      for (const slide of story.slides) {
        const result = await runSingleSlideTest(slide, apiProvider);
        results.push(result);
        totalCost += result.estimatedCost;
        completedSlides++;
        setProgress((completedSlides / totalSlides) * 100);
      }

      toast.success(`Story test complete! ${completedSlides} slides generated. Total cost: $${totalCost.toFixed(4)}`);
    } catch (error) {
      toast.error('Story test failed');
    } finally {
      setIsRunning(false);
      setProgress(0);
    }
  };

  const calculateStats = () => {
    if (testResults.length === 0) return null;

    const openaiResults = testResults.filter(r => r.api_provider === 'openai');
    const ideogramResults = testResults.filter(r => r.api_provider === 'ideogram');

    const avgOpenaiCost = openaiResults.length > 0 
      ? openaiResults.reduce((sum, r) => sum + r.estimated_cost, 0) / openaiResults.length 
      : 0;
    
    const avgIdeogramCost = ideogramResults.length > 0 
      ? ideogramResults.reduce((sum, r) => sum + r.estimated_cost, 0) / ideogramResults.length 
      : 0;

    const avgOpenaiTime = openaiResults.length > 0
      ? openaiResults.reduce((sum, r) => sum + r.generation_time_ms, 0) / openaiResults.length
      : 0;

    const avgIdeogramTime = ideogramResults.length > 0
      ? ideogramResults.reduce((sum, r) => sum + r.generation_time_ms, 0) / ideogramResults.length
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
      }
    };
  };

  const stats = calculateStats();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Ideogram API Test Suite</h1>
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
          <TabsTrigger value="results">Test Results</TabsTrigger>
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
              <CardTitle>Recent Test Results</CardTitle>
              <CardDescription>Latest image generation tests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {testResults.map(result => (
                  <div key={result.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={result.api_provider === 'openai' ? 'default' : 'secondary'}>
                            {result.api_provider.toUpperCase()}
                          </Badge>
                          <span className="text-sm font-medium">Slide {result.slide_id.substring(0, 8)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(result.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        ${result.estimated_cost?.toFixed(4)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {result.generation_time_ms}ms
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <p className="text-2xl font-bold">{Math.round(stats.openai.avgTime)}ms</p>
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
                      <p className="text-2xl font-bold">{Math.round(stats.ideogram.avgTime)}ms</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Cost Comparison */}
          {stats && stats.openai.count > 0 && stats.ideogram.count > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Cost Difference per Slide</p>
                    <p className="text-2xl font-bold">
                      {stats.ideogram.avgCost > stats.openai.avgCost ? '+' : ''}
                      ${(stats.ideogram.avgCost - stats.openai.avgCost).toFixed(4)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Estimated Cost per 5-slide Story</p>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">OpenAI: ${(stats.openai.avgCost * 5).toFixed(3)}</p>
                      <p className="text-lg font-semibold">Ideogram: ${(stats.ideogram.avgCost * 5).toFixed(3)}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Monthly Cost (100 stories)</p>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">OpenAI: ${(stats.openai.avgCost * 5 * 100).toFixed(2)}</p>
                      <p className="text-lg font-semibold">Ideogram: ${(stats.ideogram.avgCost * 5 * 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
           )}
        </TabsContent>
      </Tabs>
    </div>
  );
}