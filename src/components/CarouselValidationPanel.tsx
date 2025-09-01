import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  RefreshCw, 
  FileCheck,
  Clock,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CarouselValidationPanelProps {
  storyId: string;
  onValidationComplete?: (isValid: boolean) => void;
}

interface ValidationResult {
  slideCount: number;
  expectedSlideCount: number;
  hasImages: boolean;
  imageCount: number;
  imageQuality: 'good' | 'poor' | 'failed';
  fileSizeTotal: number;
  averageFileSize: number;
  errors: string[];
  recommendations: string[];
}

export const CarouselValidationPanel: React.FC<CarouselValidationPanelProps> = ({
  storyId,
  onValidationComplete
}) => {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [carouselData, setCarouselData] = useState<any>(null);
  const { toast } = useToast();

  const validateCarousel = async () => {
    console.log(`🔍 [VALIDATION] Starting carousel validation for story: ${storyId}`);
    setIsValidating(true);
    
    try {
      // Step 1: Get story and slides data
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select(`
          *,
          slides:slides!inner(*),
          article:articles(word_count, body)
        `)
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        throw new Error(`Failed to fetch story data: ${storyError?.message || 'Story not found'}`);
      }

      console.log(`✅ [VALIDATION] Story data loaded:`, {
        slideCount: story.slides?.length,
        storyTitle: story.title
      });

      // Step 2: Get carousel export data
      const { data: carouselExport, error: exportError } = await supabase
        .from('carousel_exports')
        .select('*')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log(`✅ [VALIDATION] Carousel export data:`, carouselExport);
      setCarouselData(carouselExport);

      // Calculate expected slide count based on article content
      const wordCount = story.article?.word_count || 0;
      let expectedSlideCount: number;
      
      if (wordCount < 200) expectedSlideCount = 3;
      else if (wordCount < 400) expectedSlideCount = 4;
      else if (wordCount < 600) expectedSlideCount = 5;
      else if (wordCount < 800) expectedSlideCount = 6;
      else if (wordCount < 1200) expectedSlideCount = 7;
      else expectedSlideCount = 8;

      console.log(`📊 [VALIDATION] Content analysis: ${wordCount} words → ${expectedSlideCount} expected slides`);

      // Step 3: Validate file existence and quality
      let hasImages = false;
      let imageCount = 0;
      let fileSizeTotal = 0;
      const errors: string[] = [];
      const recommendations: string[] = [];

      if (carouselExport?.file_paths && Array.isArray(carouselExport.file_paths) && carouselExport.file_paths.length > 0) {
        console.log(`🔍 [VALIDATION] Checking ${carouselExport.file_paths.length} image files...`);
        
        for (const filePath of carouselExport.file_paths) {
          // Type assertion since we know file_paths is string[] from our validation
          const pathString = String(filePath);
          
          try {
            // Try to get file info from storage
            const { data: fileData, error: fileError } = await supabase.storage
              .from('exports')
              .list(pathString.substring(0, pathString.lastIndexOf('/')), {
                search: pathString.substring(pathString.lastIndexOf('/') + 1)
              });

            if (fileError) {
              console.error(`❌ [VALIDATION] Error checking file ${pathString}:`, fileError);
              errors.push(`File check failed: ${pathString.substring(pathString.lastIndexOf('/') + 1)}`);
              continue;
            }

            const file = fileData?.[0];
            if (file) {
              imageCount++;
              
              // Check file size (convert from string to number if needed)
              const fileSize = typeof file.metadata?.size === 'string' 
                ? parseInt(file.metadata.size) 
                : file.metadata?.size || 0;
              
              fileSizeTotal += fileSize;
              
              console.log(`✅ [VALIDATION] File ${file.name}: ${fileSize} bytes`);
              
              // Validate file size quality
              if (fileSize < 10000) {
                errors.push(`${file.name} is suspiciously small (${fileSize} bytes)`);
              } else if (fileSize < 30000) {
                recommendations.push(`${file.name} could be higher quality (${fileSize} bytes)`);
              }
            } else {
              console.error(`❌ [VALIDATION] File not found: ${pathString}`);
              errors.push(`File missing: ${pathString.substring(pathString.lastIndexOf('/') + 1)}`);
            }
          } catch (fileCheckError) {
            console.error(`❌ [VALIDATION] Error validating file ${pathString}:`, fileCheckError);
            errors.push(`Validation error for: ${pathString.substring(pathString.lastIndexOf('/') + 1)}`);
          }
        }
        
        hasImages = imageCount > 0;
      } else {
        console.log(`❌ [VALIDATION] No carousel export found or no file paths`);
        errors.push('No carousel images found');
      }

      // Step 4: Validate slide count
      if (story.slides.length !== expectedSlideCount) {
        if (story.slides.length > expectedSlideCount) {
          recommendations.push(`Article has ${story.slides.length} slides but ${expectedSlideCount} would be optimal for ${wordCount} words`);
        } else {
          errors.push(`Only ${story.slides.length} slides generated, expected ${expectedSlideCount} for ${wordCount}-word article`);
        }
      }

      // Step 5: Validate image count matches slide count
      if (hasImages && imageCount !== story.slides.length) {
        errors.push(`Image count (${imageCount}) doesn't match slide count (${story.slides.length})`);
      }

      // Step 6: Determine overall quality
      let imageQuality: 'good' | 'poor' | 'failed' = 'failed';
      const averageFileSize = imageCount > 0 ? fileSizeTotal / imageCount : 0;

      if (hasImages && errors.length === 0) {
        imageQuality = averageFileSize > 30000 ? 'good' : 'poor';
      } else if (hasImages && errors.length < imageCount) {
        imageQuality = 'poor';
      }

      // Step 7: Add content-based recommendations
      if (story.slides.length > 0) {
        const avgWordsPerSlide = story.slides.reduce((sum: number, slide: any) => sum + (slide.word_count || 0), 0) / story.slides.length;
        
        if (avgWordsPerSlide > 40) {
          recommendations.push('Consider shorter slide content for better readability (avg: ' + Math.round(avgWordsPerSlide) + ' words per slide)');
        }
      }

      const result: ValidationResult = {
        slideCount: story.slides.length,
        expectedSlideCount,
        hasImages,
        imageCount,
        imageQuality,
        fileSizeTotal,
        averageFileSize,
        errors,
        recommendations
      };

      console.log(`🎯 [VALIDATION] Validation complete:`, result);
      setValidationResult(result);
      
      // Call completion callback
      const isValid = errors.length === 0 && hasImages && imageQuality !== 'failed';
      onValidationComplete?.(isValid);

      // Show summary toast
      if (isValid) {
        toast({
          title: 'Validation Passed',
          description: `Carousel ready: ${imageCount} images generated successfully`,
        });
      } else {
        toast({
          title: 'Validation Issues Found',
          description: `${errors.length} errors, ${recommendations.length} recommendations`,
          variant: 'destructive',
        });
      }

    } catch (error: any) {
      console.error('❌ [VALIDATION] Validation failed:', error);
      
      setValidationResult({
        slideCount: 0,
        expectedSlideCount: 0,
        hasImages: false,
        imageCount: 0,
        imageQuality: 'failed',
        fileSizeTotal: 0,
        averageFileSize: 0,
        errors: [`Validation failed: ${error.message}`],
        recommendations: []
      });

      toast({
        title: 'Validation Failed',
        description: error.message || 'Failed to validate carousel',
        variant: 'destructive',
      });

      onValidationComplete?.(false);
    } finally {
      setIsValidating(false);
    }
  };

  // Auto-validate on mount
  useEffect(() => {
    if (storyId) {
      validateCarousel();
    }
  }, [storyId]);

  const getQualityIcon = (quality: string) => {
    switch (quality) {
      case 'good': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'poor': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'good': return 'bg-green-100 text-green-800 border-green-200';
      case 'poor': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck className="h-5 w-5" />
          Carousel Validation
          {isValidating && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Validation Status */}
        {validationResult && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Slide Count</div>
                <div className="flex items-center gap-2">
                  <Badge variant={validationResult.slideCount === validationResult.expectedSlideCount ? "default" : "destructive"}>
                    {validationResult.slideCount} / {validationResult.expectedSlideCount}
                  </Badge>
                  {validationResult.slideCount === validationResult.expectedSlideCount ? 
                    <CheckCircle2 className="h-4 w-4 text-green-500" /> : 
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  }
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Image Quality</div>
                <div className="flex items-center gap-2">
                  <Badge className={getQualityColor(validationResult.imageQuality)}>
                    {validationResult.imageQuality}
                  </Badge>
                  {getQualityIcon(validationResult.imageQuality)}
                </div>
              </div>
            </div>

            {/* File Statistics */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium">Images Generated</div>
                <div>{validationResult.imageCount}</div>
              </div>
              <div>
                <div className="font-medium">Total Size</div>
                <div>{formatFileSize(validationResult.fileSizeTotal)}</div>
              </div>
              <div>
                <div className="font-medium">Average Size</div>
                <div>{formatFileSize(validationResult.averageFileSize)}</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Completion Status</span>
                <span>{Math.round((validationResult.imageCount / validationResult.slideCount) * 100)}%</span>
              </div>
              <Progress 
                value={(validationResult.imageCount / validationResult.slideCount) * 100} 
                className="h-2"
              />
            </div>

            <Separator />

            {/* Errors */}
            {validationResult.errors.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Issues Found ({validationResult.errors.length})
                </div>
                <div className="space-y-1">
                  {validationResult.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      • {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {validationResult.recommendations.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-yellow-700 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Recommendations ({validationResult.recommendations.length})
                </div>
                <div className="space-y-1">
                  {validationResult.recommendations.map((rec, index) => (
                    <div key={index} className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                      • {rec}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Carousel Export Status */}
            {carouselData && (
              <div className="space-y-2">
                <div className="font-medium">Export Status</div>
                <div className="flex items-center gap-2">
                  <Badge variant={carouselData.status === 'completed' ? 'default' : 'destructive'}>
                    {carouselData.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {carouselData.updated_at ? new Date(carouselData.updated_at).toLocaleString() : 'Unknown'}
                  </span>
                </div>
                {carouselData.error_message && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    {carouselData.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={validateCarousel} 
            disabled={isValidating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
            Re-validate
          </Button>
          
          {validationResult?.hasImages && (
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Report
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};