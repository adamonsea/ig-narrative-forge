import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2, 
  X, 
  Clock, 
  AlertTriangle, 
  ExternalLink,
  Sparkles,
  XCircle,
  Edit3,
  Eye,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileText,
  Calendar,
  User,
  BookOpen,
  RefreshCw,
  MapPin,
  Zap,
  Trash2
} from 'lucide-react';

// Article interfaces
interface Article {
  id: string;
  title: string;
  body: string;
  author: string | null;
  published_at: string | null;
  source_url: string;
  region: string | null;
  word_count: number | null;
  import_metadata: any;
  created_at: string;
  category?: string;
  tags?: string[];
  reading_time_minutes?: number;
  summary?: string;
  source_name?: string;
  source_domain?: string;
  queue_status?: string;
  queue_type?: string;
  queue_id?: string;
  queue_attempts?: number;
  queue_max_attempts?: number;
  queue_error?: string;
  is_stuck?: boolean;
}

// Slide and Story interfaces
interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface StoryArticle {
  id: string;
  title: string;
  author?: string;
  source_url: string;
  region?: string;
  published_at?: string | null;
  word_count?: number | null;
}

interface Post {
  id: string;
  caption?: string;
  hashtags?: any;
  source_attribution?: string;
  story_id: string;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
  articles?: StoryArticle; // Different query aliases
  posts?: Post[];
}

interface ContentPipelineProps {
  onRefresh?: () => void;
}

export const ContentPipeline = ({ onRefresh }: ContentPipelineProps) => {
  // Article queue state
  const [articles, setArticles] = useState<Article[]>([]);
  const [queuedArticles, setQueuedArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);

  // Story state
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [isResettingStalled, setIsResettingStalled] = useState(false);
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());

  // Edit slide state
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');

  const { toast } = useToast();

  // Real-time subscriptions instead of disruptive auto-refresh
  useEffect(() => {
    // Set up real-time subscription for content generation queue updates
    const queueChannel = supabase
      .channel('queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_generation_queue'
        },
        () => {
          // Only refresh queued articles when queue changes
          loadQueuedArticles();
        }
      )
      .subscribe();

    // Set up real-time subscription for story updates
    const storyChannel = supabase
      .channel('story-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        () => {
          // Refresh stories when they change
          loadStories();
        }
      )
      .subscribe();

    // Set up real-time subscription for article updates
    const articleChannel = supabase
      .channel('article-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'articles'
        },
        () => {
          // Refresh available articles when their status changes
          loadPendingArticles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(storyChannel);
      supabase.removeChannel(articleChannel);
    };
  }, []);

  useEffect(() => {
    loadPendingArticles();
    loadQueuedArticles();
    loadStories();
  }, []);

  // Load articles with queue status
  const loadQueuedArticles = async () => {
    try {
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          article_id,
          status,
          slidetype,
          attempts,
          max_attempts,
          error_message,
          created_at
        `)
        .in('status', ['pending', 'processing']);

      if (queueError) throw queueError;

      const queuedIds = queueData?.map(q => q.article_id) || [];
      
      if (queuedIds.length > 0) {
        const { data: articleData, error: articleError } = await supabase
          .from('articles')
          .select(`
            id, title, author, published_at, category, tags, word_count, 
            reading_time_minutes, source_url, region, summary, body, created_at,
            import_metadata,
            source_name:content_sources(source_name),
            source_domain:content_sources(canonical_domain)
          `)
          .in('id', queuedIds);

        if (articleError) throw articleError;

        const enrichedQueuedArticles = articleData?.map(article => {
          const queueInfo = queueData.find(q => q.article_id === article.id);
          const isStuck = queueInfo && (
            queueInfo.attempts >= queueInfo.max_attempts ||
            (queueInfo.status === 'processing' && 
             new Date(queueInfo.created_at).getTime() < Date.now() - 10 * 60 * 1000)
          );
          
          return {
            ...article,
            import_metadata: {}, // Add empty metadata for queued articles
            source_name: article.source_name?.source_name || 'Unknown',
            source_domain: article.source_domain?.canonical_domain || 'unknown.com',
            queue_status: queueInfo?.status || 'pending',
            queue_type: queueInfo?.slidetype || 'tabloid',
            queue_id: queueInfo?.id,
            queue_attempts: queueInfo?.attempts || 0,
            queue_max_attempts: queueInfo?.max_attempts || 3,
            queue_error: queueInfo?.error_message,
            is_stuck: isStuck
          };
        }) || [];

        setQueuedArticles(enrichedQueuedArticles);
      } else {
        setQueuedArticles([]);
      }
    } catch (error) {
      console.error('Error loading queued articles:', error);
      setQueuedArticles([]);
    }
  };

  const clearStuckJob = async (article: Article) => {
    if (!article.queue_id) return;
    
    try {
      // Remove the stuck job from queue
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', article.queue_id);

      if (deleteError) throw deleteError;

      // Reset associated story back to draft if exists
      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('article_id', article.id);

      if (resetError) {
        console.warn('Could not reset story status:', resetError);
      }

      toast({
        title: "Stuck Job Cleared",
        description: `Cleared stuck job for "${article.title}"`,
      });
      
      // Refresh the queued articles to show the change
      loadQueuedArticles();
      loadPendingArticles(); // Article might reappear in pipeline
    } catch (error: any) {
      console.error('Error clearing stuck job:', error);
      toast({
        title: "Clear Failed",
        description: `Failed to clear stuck job: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const cancelQueuedJob = async (article: Article) => {
    if (!article.queue_id) return;
    
    try {
      // Remove the job from queue
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', article.queue_id);

      if (deleteError) throw deleteError;

      // Reset associated story back to draft if exists
      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('article_id', article.id);

      if (resetError) {
        console.warn('Could not reset story status:', resetError);
      }

      toast({
        title: "Job Cancelled",
        description: `Cancelled generation for "${article.title}" - returned to pipeline`,
      });
      
      // Refresh both panels
      loadQueuedArticles();
      loadPendingArticles(); // Article should reappear in available articles
    } catch (error: any) {
      console.error('Error cancelling job:', error);
      toast({
        title: "Cancel Failed",
        description: `Failed to cancel job: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const resetStalledProcessing = async () => {
    setIsResettingStalled(true);
    try {
      const { error } = await supabase.rpc('reset_stalled_processing');
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Stalled processing jobs have been reset",
      });
      
      // Reload both panels to show updated status
      loadStories();
      loadPendingArticles();
    } catch (error) {
      console.error('Error resetting stalled processing:', error);
      toast({
        title: "Error",
        description: "Failed to reset stalled processing jobs",
        variant: "destructive",
      });
    } finally {
      setIsResettingStalled(false);
    }
  };

  // Extract content function
  const handleExtractContent = async (article: Article) => {
    try {
      setProcessingArticle(article.id);
      
      // Call the content extractor edge function
      const { data, error } = await supabase.functions.invoke('content-extractor', {
        body: { 
          articleId: article.id,
          sourceUrl: article.source_url 
        }
      });

      if (error) throw error;

      if (data?.success) {
        const wordCountChange = data.wordCount ? ` (${data.wordCount} words)` : '';
        const extractedLength = data.bodyLength ? ` ${data.bodyLength} characters` : '';
        const method = data.extractionMethod || 'direct';
        
        toast({
          title: 'Content Extracted Successfully',
          description: `Extracted${wordCountChange} using ${method} method.${extractedLength ? ` Content: ${extractedLength}` : ''}`,
        });
        
        // Show content preview if available
        if (data.wordCount && data.wordCount > 10) {
          setTimeout(() => {
            toast({
              title: 'Content Preview',
              description: data.title ? `"${data.title.substring(0, 100)}..."` : 'Content successfully extracted from article',
            });
          }, 1000);
        }
        
        // Refresh articles to show updated content
        loadPendingArticles();
      } else {
        throw new Error(data?.error || 'Content extraction failed');
      }
    } catch (error: any) {
      console.error('Content extraction error:', error);
      toast({
        title: 'Extraction Failed',
        description: error.message || 'Failed to extract article content',
        variant: 'destructive',
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  // Article queue functions
  const loadPendingArticles = async () => {
    try {
      setLoadingArticles(true);
      
      // First get article IDs that already have stories OR queued jobs
      const { data: existingStories, error: storiesError } = await supabase
        .from('stories')
        .select('article_id');

      if (storiesError) throw storiesError;

      const { data: queuedJobs, error: queueError } = await supabase
        .from('content_generation_queue')
        .select('article_id')
        .in('status', ['pending', 'processing']);

      if (queueError) throw queueError;

      const articlesWithStories = new Set(existingStories?.map(s => s.article_id) || []);
      const articlesQueued = new Set(queuedJobs?.map(j => j.article_id) || []);
      
      // Only fetch articles with 'new' processing status that don't have stories or queued jobs
      const { data: articles, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('processing_status', 'new')
        .order('created_at', { ascending: false })
        .limit(50);

      if (articlesError) throw articlesError;

      // Filter out articles that already have stories or are queued (safety net)
      const availableArticles = (articles || []).filter(article => 
        !articlesWithStories.has(article.id) && !articlesQueued.has(article.id)
      );

      // Sort articles: non-reviews first (by relevance), then reviews at bottom
      const isReview = (article: Article) => {
        const title = article.title.toLowerCase();
        const body = article.body?.toLowerCase() || '';
        
        return title.includes('review') || 
               title.includes('theatre') || 
               title.includes('theater') ||
               title.includes('film') ||
               title.includes('movie') ||
               title.includes('cinema') ||
               title.includes('play') ||
               title.includes('performance') ||
               body.includes('stars out of') ||
               body.includes('rating:') ||
               body.includes('★') ||
               /\d\/\d+/.test(title);
      };

      const sortedArticles = availableArticles.sort((a, b) => {
        const aIsReview = isReview(a);
        const bIsReview = isReview(b);
        
        if (aIsReview && !bIsReview) return 1;
        if (!aIsReview && bIsReview) return -1;
        
        const aScore = (a.import_metadata as any)?.eastbourne_relevance_score || 0;
        const bScore = (b.import_metadata as any)?.eastbourne_relevance_score || 0;
        return bScore - aScore;
      });

      setArticles(sortedArticles);
    } catch (error: any) {
      console.error('Error loading articles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load article queue',
        variant: 'destructive',
      });
    } finally {
      setLoadingArticles(false);
    }
  };

  const approveArticle = async (article: Article, slideType: 'short' | 'tabloid' | 'indepth' = 'tabloid') => {
    try {
      setProcessingArticle(article.id);
      
      // Add job to the queue instead of calling content-generator directly
      const { data: queueJob, error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: article.id,
          slidetype: slideType, // Fixed: using lowercase 'slidetype' to match DB schema
          status: 'pending'
        })
        .select()
        .single();

      if (queueError) throw new Error(`Failed to queue job: ${queueError.message}`);

      const typeLabels = {
        short: 'Short Carousel',
        tabloid: 'Tabloid Style',
        indepth: 'In-Depth Analysis'
      };

      toast({
        title: 'Generation Queued!',
        description: `${typeLabels[slideType]} generation added to queue. Processing will start shortly.`,
      });

      // Refresh both panels - article should disappear from pipeline and eventually appear in review
      loadPendingArticles();
      loadStories();

    } catch (error: any) {
      console.error('Queueing error:', error);
      toast({
        title: 'Queue Failed',
        description: error.message || 'Failed to queue generation',
        variant: 'destructive',
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const rejectArticle = async (articleId: string) => {
    try {
      // Update processing status to 'discarded'
      const { error } = await supabase
        .from('articles')
        .update({
          processing_status: 'discarded'
        })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Article Rejected',
        description: 'Article moved to discarded status',
      });

      // Remove from local state
      setArticles(articles.filter(article => article.id !== articleId));
      
    } catch (error: any) {
      console.error('Error rejecting article:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject article',
        variant: 'destructive',
      });
    }
  };

  // Story functions - only load draft stories for review
  const loadStories = async () => {
    setLoadingStories(true);
    try {
      const { data: stories, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides:slides(*),
          article:articles!stories_article_id_fkey(
            id,
            title,
            author,
            source_url,
            region,
            published_at,
            word_count
          ),
          posts:posts(*)
        `)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter out stories that don't have any slides (orphaned stories)
      const storiesWithSlides = (stories || []).filter(story => 
        story.slides && story.slides.length > 0
      );
      
      setStories(storiesWithSlides);
    } catch (error) {
      console.error('Error loading stories:', error);
      toast({
        title: "Error",
        description: "Failed to load stories",
        variant: "destructive",
      });
    } finally {
      setLoadingStories(false);
    }
  };

  // In-house carousel generation function
  const generateCarouselImagesInHouse = async (story: Story): Promise<void> => {
    console.log('🎨 Starting in-house carousel generation for story:', story.id);
    
    // Validate story structure
    if (!story?.slides || !Array.isArray(story.slides) || story.slides.length === 0) {
      console.error('❌ Invalid story structure or no slides found:', story);
      toast({
        title: 'Invalid Story',
        description: 'Story has no slides or invalid structure',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Generating carousel images...',
      description: `Creating ${story.slides.length} carousel images`,
    });
    
    try {
      // First, create or update carousel export record with pending status
      console.log('💾 Creating pending carousel export record...');
      const { error: pendingError } = await supabase
        .from('carousel_exports')
        .upsert({
          story_id: story.id,
          status: 'generating',
          export_formats: { formats: ['instagram-square'] },
          file_paths: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'story_id'
        });
      
      if (pendingError) {
        console.error('❌ Failed to create pending carousel export record:', pendingError);
        throw new Error('Failed to initialize carousel export record');
      }

      // Import html2canvas dynamically
      const html2canvas = (await import('html2canvas')).default;
      console.log('✅ html2canvas loaded');
      
      const generatedImages: string[] = [];
      
      // Generate images for each slide
      for (let i = 0; i < story.slides.length; i++) {
        const slide = story.slides[i];
        console.log(`🖼️ Generating image for slide ${i + 1}/${story.slides.length}:`, slide.content?.substring(0, 50) + '...');
        
        // Create slide element
        let slideElement: HTMLDivElement | null = null;
        try {
          slideElement = createSlideElement(slide, story, i + 1);
          document.body.appendChild(slideElement);
          
          // Wait longer for fonts and rendering
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Generate image using html2canvas with better options
          const canvas = await html2canvas(slideElement, {
            width: 1080,
            height: 1080,
            backgroundColor: '#ffffff',
            scale: 1,
            useCORS: true,
            allowTaint: false,
            logging: false,
            imageTimeout: 15000,
            onclone: (clonedDoc) => {
              // Ensure fonts are available in cloned document
              const style = clonedDoc.createElement('style');
              style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; }
              `;
              clonedDoc.head.appendChild(style);
            }
          });
          
          console.log(`✅ Canvas created for slide ${i + 1}, size: ${canvas.width}x${canvas.height}`);
          
          // Validate canvas content
          if (canvas.width === 0 || canvas.height === 0) {
            throw new Error('Canvas has zero dimensions');
          }
          
          // Convert to base64
          const imageData = canvas.toDataURL('image/png', 0.9);
          if (!imageData || imageData === 'data:,') {
            throw new Error('Failed to generate image data');
          }
          
          generatedImages.push(imageData);
          console.log(`✅ Image data generated for slide ${i + 1} (${Math.round(imageData.length / 1024)}KB)`);
          
        } catch (canvasError) {
          console.error(`❌ Failed to generate canvas for slide ${i + 1}:`, canvasError);
          toast({
            title: 'Image Generation Failed',
            description: `Failed to generate image for slide ${i + 1}: ${canvasError instanceof Error ? canvasError.message : 'Unknown error'}`,
            variant: 'destructive',
          });
          // Continue with other slides instead of stopping completely
        } finally {
          // Clean up DOM element safely
          if (slideElement && slideElement.parentNode) {
            try {
              document.body.removeChild(slideElement);
            } catch (removeError) {
              console.warn('⚠️ Failed to remove slide element:', removeError);
            }
          }
        }
      }
      
      console.log(`🎯 Generated ${generatedImages.length} images out of ${story.slides.length} slides`);
      
      if (generatedImages.length === 0) {
        // Update carousel export with failed status
        await supabase
          .from('carousel_exports')
          .update({
            status: 'failed',
            error_message: 'No images could be generated',
            updated_at: new Date().toISOString()
          })
          .eq('story_id', story.id);
          
        toast({
          title: 'No Images Generated',
          description: 'Failed to generate any carousel images',
          variant: 'destructive',
        });
        return;
      }
      
      // Upload images to Supabase storage
      console.log('☁️ Starting upload to Supabase storage...');
      const filePaths: string[] = [];
      
      for (let i = 0; i < generatedImages.length; i++) {
        const fileName = `carousel_${story.id}_slide_${i + 1}_${Date.now()}.png`;
        const filePath = `carousels/${story.id}/${fileName}`;
        
        try {
          // Convert base64 to blob more efficiently
          const base64Data = generatedImages[i].split(',')[1];
          if (!base64Data) {
            throw new Error('Invalid base64 data');
          }
          
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let j = 0; j < byteCharacters.length; j++) {
            byteNumbers[j] = byteCharacters.charCodeAt(j);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });
          
          console.log(`⬆️ Uploading ${fileName} (${Math.round(blob.size / 1024)}KB)`);
          
          const { error: uploadError } = await supabase.storage
            .from('exports')
            .upload(filePath, blob, {
              contentType: 'image/png',
              upsert: true,
              cacheControl: '3600'
            });
          
          if (uploadError) {
            console.error(`❌ Failed to upload ${fileName}:`, uploadError);
            throw uploadError;
          }
          
          filePaths.push(filePath);
          console.log(`✅ Uploaded: ${filePath}`);
          
        } catch (uploadError) {
          console.error(`❌ Error processing upload for slide ${i + 1}:`, uploadError);
          toast({
            title: 'Upload Error',
            description: `Failed to upload image ${i + 1}`,
            variant: 'destructive',
          });
        }
      }
      
      console.log(`☁️ Uploaded ${filePaths.length} files to storage`);
      
      if (filePaths.length === 0) {
        // Update carousel export with failed status
        await supabase
          .from('carousel_exports')
          .update({
            status: 'failed',
            error_message: 'Failed to upload any images to storage',
            updated_at: new Date().toISOString()
          })
          .eq('story_id', story.id);
          
        toast({
          title: 'Upload Failed',
          description: 'Failed to upload any images to storage',
          variant: 'destructive',
        });
        return;
      }
      
      // Update carousel export record with success
      console.log('💾 Updating carousel export record with success...');
      const { error: exportError } = await supabase
        .from('carousel_exports')
        .update({
          status: 'completed',
          export_formats: { formats: ['instagram-square'] },
          file_paths: filePaths,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('story_id', story.id);
      
      if (exportError) {
        console.error('❌ Failed to update carousel export record:', exportError);
        toast({
          title: 'Database Error',
          description: 'Images uploaded but failed to update record',
          variant: 'destructive',
        });
        return;
      }
      
      console.log('🎉 Carousel generation completed successfully!');
      toast({
        title: 'Carousel Generated!',
        description: `Successfully generated ${filePaths.length} carousel images`,
      });
      
    } catch (error) {
      console.error('❌ Error in carousel generation:', error);
      
      // Update carousel export with error status
      try {
        await supabase
          .from('carousel_exports')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('story_id', story.id);
      } catch (dbError) {
        console.error('❌ Failed to update error status:', dbError);
      }
      
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate carousel images: ' + (error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
    }
  };

  const createSlideElement = (slide: Slide, story: Story, slideNumber: number): HTMLDivElement => {
    const element = document.createElement('div');
    element.style.cssText = `
      position: absolute;
      left: -9999px;
      top: -9999px;
      width: 1080px;
      height: 1080px;
      background: #ffffff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 60px;
      box-sizing: border-box;
      border: 1px solid #f0f0f0;
      color: #1a1a1a;
    `;
    
    // Safely extract content with fallbacks
    const content = slide?.content || 'No content available';
    const title = story?.title || 'Untitled Story';
    const author = story?.article?.author || 
                   story?.articles?.author || 
                   'Unknown Author';
    const totalSlides = story?.slides?.length || 1;
    
    // Escape HTML to prevent XSS and rendering issues
    const escapeHtml = (str: string) => 
      str.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
    
    element.innerHTML = `
      <div style="position: absolute; top: 40px; right: 40px; font-size: 18px; color: #666666; font-weight: 500; z-index: 10;">
        ${slideNumber}/${totalSlides}
      </div>
      
      <div style="
        font-size: 32px; 
        font-weight: 600; 
        color: #1a1a1a; 
        line-height: 1.3; 
        max-width: 100%; 
        word-wrap: break-word; 
        hyphens: auto;
        text-align: center;
        margin: 20px 0;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        ${escapeHtml(content)}
      </div>
      
      <div style="
        position: absolute; 
        bottom: 40px; 
        left: 60px; 
        right: 60px; 
        text-align: center;
        z-index: 10;
      ">
        <div style="
          font-size: 18px; 
          color: #666666; 
          margin-bottom: 20px; 
          font-weight: 500;
          line-height: 1.4;
        ">
          ${escapeHtml(title)}
        </div>
        <div style="
          font-size: 14px; 
          color: #999999; 
          font-weight: 400;
        ">
          By ${escapeHtml(author)}
        </div>
      </div>
    `;
    
    return element;
  };

  // Helper function to convert data URL to blob
  const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleApproveStory = async (storyId: string) => {
    // Both approve buttons now generate carousel images automatically
    await handleApproveStoryWithImages(storyId);
  };

  const handleApproveStoryWithImages = async (storyId: string) => {
    if (processingApproval.has(storyId)) {
      console.log('⚠️ Story approval already in progress:', storyId);
      return;
    }

    console.log('🚀 Approving story with images:', storyId);
    setProcessingApproval(prev => new Set(prev).add(storyId));
    
    try {
      // First check current status and get story data
      const { data: currentStory, error: fetchError } = await supabase
        .from('stories')
        .select(`
          *,
          slides(*),
          article:articles!stories_article_id_fkey(
            id,
            title,
            author,
            source_url
          )
        `)
        .eq('id', storyId)
        .single();

      if (fetchError) throw fetchError;
      
      console.log('📋 Current story status:', currentStory.status);

      if (currentStory.status === 'ready') {
        console.log('✅ Story already approved');
        toast({
          title: 'Already Approved',
          description: 'This story is already approved',
        });
        return;
      }

      // Update status to ready
      const { error: updateError } = await supabase
        .from('stories')
        .update({ 
          status: 'ready',
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (updateError) throw updateError;

      // Generate carousel images using in-house component
      await generateCarouselImagesInHouse(currentStory);

      toast({
        title: 'Story Approved',
        description: 'Story approved and carousel images generated',
      });

      // Only refresh stories
      await loadStories();
      
    } catch (error: any) {
      console.error('❌ Failed to approve story with images:', error);
      toast({
        title: 'Error',
        description: `Failed to approve story: ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setProcessingApproval(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
    }
  };

  const handleRejectStory = async (storyId: string) => {
    try {
      // First get the article_id from the story
      const { data: story, error: storyFetchError } = await supabase
        .from('stories')
        .select('article_id')
        .eq('id', storyId)
        .single();

      if (storyFetchError) throw storyFetchError;

      // Reset the article status to 'new' so it reappears in the content pipeline
      const { error: articleError } = await supabase
        .from('articles')
        .update({ processing_status: 'new' })
        .eq('id', story.article_id);

      if (articleError) throw articleError;

      // Delete the story and its slides
      const { error: slidesError } = await supabase
        .from('slides')
        .delete()
        .eq('story_id', storyId);

      if (slidesError) throw slidesError;

      const { error: storyError } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (storyError) throw storyError;
      
      setStories(stories.filter(story => story.id !== storyId));
      toast({
        title: "Story Rejected",
        description: "Story deleted and article returned to validation queue.",
      });

      // Refresh both panels as the article is now available again
      loadPendingArticles();
      loadStories();
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({
        title: "Error", 
        description: "Failed to reject story. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'draft' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Story Returned to Review',
        description: 'Story status changed to draft for re-review',
      });

      loadStories();
      loadPendingArticles(); // Refresh in case there are workflow changes
    } catch (error) {
      console.error('Failed to return story:', error);
      toast({
        title: 'Error',
        description: 'Failed to return story to review',
        variant: 'destructive',
      });
    }
  };

  const handleEditSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setEditContent(slide.content);
  };

  const handleSaveSlide = async () => {
    if (!editingSlide) return;

    try {
      const wordCount = editContent.trim().split(/\s+/).length;
      
      const { error } = await supabase
        .from('slides')
        .update({ 
          content: editContent.trim(),
          word_count: wordCount
        })
        .eq('id', editingSlide.id);

      if (error) throw error;

      toast({
        title: 'Slide Updated',
        description: 'Slide content has been updated',
      });

      setEditingSlide(null);
      loadStories();
    } catch (error) {
      console.error('Failed to update slide:', error);
      toast({
        title: 'Error',
        description: 'Failed to update slide',
        variant: 'destructive',
      });
    }
  };

  const toggleStoryExpanded = (storyId: string) => {
    const newExpanded = new Set(expandedStories);
    if (newExpanded.has(storyId)) {
      newExpanded.delete(storyId);
    } else {
      newExpanded.add(storyId);
    }
    setExpandedStories(newExpanded);
  };

  // Helper functions
  const getRelevanceColor = (score: number) => {
    if (score >= 15) return 'bg-green-500';
    if (score >= 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getWordCountBadge = (wordCount: number) => {
    if (wordCount <= 15) return <Badge variant="default" className="text-xs">Hook</Badge>;
    if (wordCount <= 30) return <Badge variant="secondary" className="text-xs">Body</Badge>;
    return <Badge variant="outline" className="text-xs">Long</Badge>;
  };

  const getArticleWordCountBadge = (wordCount: number) => {
    return <Badge variant="outline" className="text-xs">{wordCount} words</Badge>;
  };

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    const maxWords = slideNumber === 1 ? 15 : slideNumber <= 3 ? 25 : slideNumber <= 6 ? 35 : 40;
    if (wordCount <= maxWords) return 'text-green-600';
    if (wordCount <= maxWords + 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-500">Published</Badge>;
      case 'draft':
        return <Badge variant="outline">Pending Review</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Approved</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Only show draft stories in this component
  const draftStories = stories;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: Content Pipeline */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Content Pipeline
            </CardTitle>
            <CardDescription>
              Review and approve articles for slide generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {loadingArticles ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : articles.length === 0 && queuedArticles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No articles available for processing</p>
                </div>
              ) : (
                <>
                  {/* Queued Articles - Now at the top */}
                  {queuedArticles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-primary">Queued for Processing ({queuedArticles.length})</h3>
                        <Button 
                          onClick={loadQueuedArticles}
                          variant="outline" 
                          size="sm"
                          className="text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Refresh Queue
                        </Button>
                      </div>
                      {queuedArticles.map((article) => (
                        <Card key={`queued-${article.id}`} className="border border-primary/30 bg-primary/5">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className={`text-xs ${
                                    article.is_stuck 
                                      ? 'bg-red-50 text-red-700 border-red-200' 
                                      : article.queue_status === 'processing' 
                                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                        : 'bg-primary/10 text-primary border-primary/30'
                                  }`}>
                                    {article.is_stuck ? (
                                      <>
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Stuck ({article.queue_attempts}/{article.queue_max_attempts})
                                      </>
                                    ) : article.queue_status === 'processing' ? (
                                      <>
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-1" />
                                        Processing
                                      </>
                                    ) : (
                                      <>
                                        <Clock className="w-3 h-3 mr-1" />
                                        Queued ({article.queue_type})
                                      </>
                                    )}
                                  </Badge>
                                  {getArticleWordCountBadge(article.word_count || 0)}
                                </div>
                                <h3 className="font-medium text-sm mb-1 line-clamp-2">{article.title}</h3>
                                {article.is_stuck && article.queue_error && (
                                  <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 rounded border border-red-200">
                                    <strong>Error:</strong> {article.queue_error}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                  <span>{article.author || 'Unknown Author'}</span>
                                  <span>•</span>
                                  <span>{new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                                  {article.region && (
                                    <>
                                      <span>•</span>
                                      <Badge variant="outline" className="text-xs">{article.region}</Badge>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center mt-2">
                              <div className="flex gap-2">
                                {article.is_stuck ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => clearStuckJob(article)}
                                    className="flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Clear Stuck Job
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => cancelQueuedJob(article)}
                                    className="flex items-center gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                                  >
                                    <X className="w-3 h-3" />
                                    Cancel
                                  </Button>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                   // Validate URL before opening
                                   let url = article.source_url;
                                   if (!url) {
                                     toast({
                                       title: 'No URL Available',
                                       description: 'This article doesn\'t have a source URL',
                                       variant: 'destructive',
                                     });
                                     return;
                                   }

                                   // Decode HTML entities and clean URL
                                   url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
                                   
                                   // Ensure URL has protocol
                                   const validUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
                                   
                                     try {
                                       console.log('Opening URL:', validUrl);
                                       window.open(validUrl, '_blank', 'noopener,noreferrer');
                                     } catch (error) {
                                     console.warn('Failed to open URL, copying instead:', error);
                                     // Fallback: copy URL to clipboard
                                     navigator.clipboard?.writeText(validUrl);
                                     toast({
                                       title: 'Link Copied',
                                       description: 'Popup blocked. Article URL copied to clipboard - paste in browser to view.',
                                     });
                                   }
                                 }}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View Original
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Available Articles */}
                  {articles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-muted-foreground">Available Articles ({articles.length})</h3>
                        <Button 
                          onClick={loadPendingArticles}
                          variant="outline" 
                          size="sm"
                          className="text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Refresh Available
                        </Button>
                      </div>
                      {articles.map((article) => {
                    const relevanceScore = (article.import_metadata as any)?.eastbourne_relevance_score || 0;
                    const isProcessing = processingArticle === article.id;
                    const isReview = article.title.toLowerCase().includes('review') || 
                                   article.title.toLowerCase().includes('theatre') ||
                                   article.title.toLowerCase().includes('film');
                    
                    return (
                      <Card key={article.id} className="border border-border/40">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                  Available
                                </Badge>
                                <span className="text-xs text-muted-foreground">Score: {relevanceScore}</span>
                                {getArticleWordCountBadge(article.word_count || 0)}
                              </div>
                              <h3 className="font-medium text-sm mb-1 line-clamp-2">{article.title}</h3>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <span>{article.author || 'Unknown Author'}</span>
                                <span>•</span>
                                <span>{new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                                {article.region && (
                                  <>
                                    <span>•</span>
                                    <Badge variant="outline" className="text-xs">{article.region}</Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          
                           <div className="flex gap-2">
                             <Button 
                               size="sm" 
                               onClick={() => approveArticle(article, 'short')}
                               disabled={isProcessing}
                               className="flex-1"
                             >
                               <CheckCircle2 className="w-3 h-3 mr-1" />
                               Short
                             </Button>
                             <Button 
                               size="sm" 
                               variant="secondary"
                               onClick={() => approveArticle(article, 'tabloid')}
                               disabled={isProcessing}
                               className="flex-1"
                             >
                               <Sparkles className="w-3 h-3 mr-1" />
                               Tabloid
                             </Button>
                             <Button 
                               size="sm" 
                               variant="outline"
                               onClick={() => approveArticle(article, 'indepth')}
                               disabled={isProcessing}
                               className="flex-1"
                             >
                               <BookOpen className="w-3 h-3 mr-1" />
                               In-Depth
                             </Button>
                             <Button 
                               size="sm" 
                               variant="destructive"
                               onClick={() => rejectArticle(article.id)}
                               disabled={isProcessing}
                             >
                               <X className="w-3 h-3" />
                             </Button>
                           </div>
                           
                           <div className="flex justify-between mt-2">
                              {(article.word_count || 0) <= 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleExtractContent(article)}
                                  disabled={processingArticle === article.id}
                                  className="text-blue-600 border-blue-200"
                                >
                                  {processingArticle === article.id ? (
                                    <>
                                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                      Extracting...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3 h-3 mr-1" />
                                      Extract Content
                                    </>
                                  )}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                 onClick={() => {
                                   // Validate URL before opening
                                   let url = article.source_url;
                                   if (!url) {
                                     toast({
                                       title: 'No URL Available',
                                       description: 'This article doesn\'t have a source URL',
                                       variant: 'destructive',
                                     });
                                     return;
                                   }

                                   // Decode HTML entities and clean URL
                                   url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
                                   
                                   // Ensure URL has protocol
                                   const validUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
                                   
                                     try {
                                       console.log('Opening URL:', validUrl);
                                       window.open(validUrl, '_blank', 'noopener,noreferrer');
                                     } catch (error) {
                                     console.warn('Failed to open URL, copying instead:', error);
                                     // Fallback: copy URL to clipboard
                                     navigator.clipboard?.writeText(validUrl);
                                     toast({
                                       title: 'Link Copied',
                                       description: 'Popup blocked. Article URL copied to clipboard - paste in browser to view.',
                                     });
                                   }
                                 }}
                                className="ml-auto"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View Original
                              </Button>
                           </div>
                        </CardContent>
                      </Card>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Draft Stories Under Review */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Draft Stories Under Review
            </CardTitle>
            <CardDescription>
              Review and approve AI-generated slide carousels for publishing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStories ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : stories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No draft stories to review</p>
                <p className="text-sm">Approve articles in the left panel to generate slides for review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {draftStories.length > 0 && (
                  <div className="space-y-4">
                     <div className="flex items-center gap-2">
                       <Badge variant="outline">{draftStories.length} awaiting approval</Badge>
                       <Button variant="outline" size="sm" onClick={loadStories}>
                         <RotateCcw className="w-3 h-3 mr-1" />
                         Refresh
                       </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={resetStalledProcessing}
                          disabled={isResettingStalled}
                        >
                          <RotateCcw className={`w-3 h-3 mr-1 ${isResettingStalled ? 'animate-spin' : ''}`} />
                          Reset Stalled
                        </Button>
                     </div>
                    
                    {draftStories.map((story) => (
                      <Card key={story.id} className="border-orange-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{story.title}</CardTitle>
                            <div className="flex gap-2">
                              {story.article?.source_url && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => window.open(story.article.source_url, '_blank')}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStoryExpanded(story.id)}
                              >
                                {expandedStories.has(story.id) ? (
                                  <>
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                    Hide
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="h-4 w-4 mr-1" />
                                    View ({story.slides?.length || 0})
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{story.slides?.length || 0} slides</span>
                            <span>{new Date(story.created_at).toLocaleDateString()}</span>
                            {story.article?.author && <span>by {story.article.author}</span>}
                          </div>
                        </CardHeader>

                        {expandedStories.has(story.id) && (
                          <CardContent>
                            <div className="space-y-3">
                              {story.slides?.map((slide) => (
                                <div key={slide.id} className="border rounded-lg p-4 bg-muted/30">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        Slide {slide.slide_number}
                                      </Badge>
                                      {getWordCountBadge(slide.word_count)}
                                      <span className="text-xs text-muted-foreground">
                                        {slide.word_count} words
                                      </span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditSlide(slide)}
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <p className="text-sm leading-relaxed">{slide.content}</p>
                                  {slide.alt_text && (
                                    <p className="text-xs text-muted-foreground mt-2 italic">
                                      Alt text: {slide.alt_text}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        )}
                        
                        <div className="flex items-center justify-end gap-2 p-4 pt-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectStory(story.id)}
                            disabled={processingRejection.has(story.id) || processingApproval.has(story.id)}
                          >
                            {processingRejection.has(story.id) ? (
                              <Clock className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4 mr-1" />
                            )}
                            {processingRejection.has(story.id) ? 'Rejecting...' : 'Reject'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleApproveStory(story.id)}
                            disabled={processingApproval.has(story.id) || processingRejection.has(story.id)}
                          >
                            {processingApproval.has(story.id) ? (
                              <Clock className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                            )}
                            {processingApproval.has(story.id) ? 'Approving...' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApproveStoryWithImages(story.id)}
                            disabled={processingApproval.has(story.id) || processingRejection.has(story.id)}
                          >
                            {processingApproval.has(story.id) ? (
                              <Clock className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4 mr-1" />
                            )}
                            {processingApproval.has(story.id) ? 'Processing...' : 'Approve & Generate Images'}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Slide Modal */}
      {editingSlide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>Edit Slide {editingSlide.slide_number}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                placeholder="Slide content..."
              />
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Word count: {editContent.trim().split(/\s+/).filter(w => w).length}
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingSlide(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSlide}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};