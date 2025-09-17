import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  FileImage, 
  FileText, 
  File, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingFile {
  id: string;
  file: File;
  status: 'pending' | 'extracting' | 'rewriting' | 'completed' | 'failed';
  progress: number;
  extractedContent?: string;
  rewrittenContent?: string;
  error?: string;
  articleId?: string;
}

interface ManualContentStagingProps {
  topicId: string;
  onContentProcessed: () => void;
}

export const ManualContentStaging = ({ topicId, onContentProcessed }: ManualContentStagingProps) => {
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);
  const { toast } = useToast();

  // Critical: Process files one at a time to avoid overwhelming system
  const processNextFile = useCallback(async () => {
    const nextFile = processingFiles.find(f => f.status === 'pending');
    if (!nextFile) return;

    try {
      // Update status to extracting
      setProcessingFiles(prev => prev.map(f => 
        f.id === nextFile.id 
          ? { ...f, status: 'extracting', progress: 20 }
          : f
      ));

      console.log('📁 Processing file:', nextFile.file.name, nextFile.file.type);

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', nextFile.file);
      formData.append('topicId', topicId);

      // Call content extraction function
      const { data: extractResult, error: extractError } = await supabase.functions.invoke(
        'extract-content-from-upload',
        {
          body: formData
        }
      );

      if (extractError) throw new Error(`Extraction failed: ${extractError.message}`);
      if (!extractResult?.success) throw new Error(extractResult?.error || 'Extraction failed');

      // Update with extracted content
      setProcessingFiles(prev => prev.map(f => 
        f.id === nextFile.id 
          ? { 
              ...f, 
              status: 'rewriting', 
              progress: 50,
              extractedContent: extractResult.extractedContent 
            }
          : f
      ));

      // Instead of complex rewriting, create article directly in database and use existing pipeline
      console.log('📝 Creating article from extracted content');
      
      // Create article in shared_article_content and topic_articles tables
      const wordCount = extractResult.extractedContent.split(/\s+/).length;
      const sourceUrl = `manual-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const title = nextFile.file.name ? 
        `Manual Upload: ${nextFile.file.name.replace(/\.[^/.]+$/, "")}` : 
        'Manual Content Upload';

      // First create shared content
      const { data: sharedContent, error: sharedError } = await supabase
        .from('shared_article_content')
        .insert({
          url: sourceUrl,
          normalized_url: sourceUrl,
          title: title,
          body: extractResult.extractedContent,
          author: 'Manual Upload',
          word_count: wordCount,
          language: 'en',
          source_domain: 'manual-upload.local'
        })
        .select()
        .single();

      if (sharedError) throw new Error(`Failed to create shared content: ${sharedError.message}`);

      // Then create topic article
      const { data: topicArticle, error: topicError } = await supabase
        .from('topic_articles')
        .insert({
          shared_content_id: sharedContent.id,
          topic_id: topicId,
          regional_relevance_score: 75, // Higher score for manual uploads
          content_quality_score: 80,    // Higher quality for manual uploads
          processing_status: 'new',
          import_metadata: {
            manual_upload: true,
            original_filename: nextFile.file.name,
            upload_date: new Date().toISOString(),
            extracted_via: extractResult.contentType
          }
        })
        .select()
        .single();

      if (topicError) throw new Error(`Failed to create topic article: ${topicError.message}`);

      // Mark as completed - it will appear in the arrivals queue
      setProcessingFiles(prev => prev.map(f => 
        f.id === nextFile.id 
          ? { 
              ...f, 
              status: 'completed', 
              progress: 100,
              rewrittenContent: title,
              articleId: topicArticle.id
            }
          : f
      ));

      toast({
        title: "File Processed",
        description: `"${nextFile.file.name}" has been processed and added to the arrivals queue.`
      });

      // Trigger refresh of main queue
      onContentProcessed();

      // Process next file after brief delay
      setTimeout(() => {
        processNextFile();
      }, 1000);

    } catch (error: any) {
      console.error('Error processing file:', error);
      
      setProcessingFiles(prev => prev.map(f => 
        f.id === nextFile.id 
          ? { 
              ...f, 
              status: 'failed', 
              progress: 0,
              error: error.message 
            }
          : f
      ));

      toast({
        title: "Processing Failed",
        description: `Failed to process "${nextFile.file.name}": ${error.message}`,
        variant: "destructive"
      });

      // Continue with next file even if one fails
      setTimeout(() => {
        processNextFile();
      }, 500);
    }
  }, [processingFiles, topicId, onContentProcessed, toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Critical: Validate file types and sizes
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = file.type.startsWith('image/') || 
                         file.type === 'application/pdf' || 
                         file.type.startsWith('text/') ||
                         file.name.endsWith('.txt');
      const isValidSize = file.size <= 20 * 1024 * 1024; // 20MB limit
      
      if (!isValidType) {
        toast({
          title: "Invalid File Type",
          description: `"${file.name}" is not supported. Use images, PDFs, or text files.`,
          variant: "destructive"
        });
        return false;
      }
      
      if (!isValidSize) {
        toast({
          title: "File Too Large",
          description: `"${file.name}" exceeds 20MB limit.`,
          variant: "destructive"
        });
        return false;
      }
      
      return true;
    });

    const newFiles: ProcessingFile[] = validFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0
    }));

    setProcessingFiles(prev => [...prev, ...newFiles]);
    
    toast({
      title: "Files Added",
      description: `${validFiles.length} file${validFiles.length !== 1 ? 's' : ''} added to processing queue.`
    });

    // Start processing
    setTimeout(processNextFile, 100);
  }, [processNextFile, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
      'application/pdf': ['.pdf'],
      'text/*': ['.txt', '.md']
    },
    multiple: true
  });

  const removeFile = (fileId: string) => {
    setProcessingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const retryFile = (fileId: string) => {
    setProcessingFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'pending', progress: 0, error: undefined }
        : f
    ));
    setTimeout(processNextFile, 100);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <FileImage className="w-4 h-4" />;
    if (file.type === 'application/pdf') return <File className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getStatusIcon = (status: ProcessingFile['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'extracting': 
      case 'rewriting': return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = (status: ProcessingFile['status']) => {
    switch (status) {
      case 'pending': return 'Waiting...';
      case 'extracting': return 'Extracting content...';
      case 'rewriting': return 'AI rewriting...';
      case 'completed': return 'Ready in arrivals queue';
      case 'failed': return 'Processing failed';
    }
  };

  const hasActiveFiles = processingFiles.some(f => 
    ['pending', 'extracting', 'rewriting'].includes(f.status)
  );

  return (
    <Card className="mb-6 border-dashed border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Manual Content Staging
          {hasActiveFiles && (
            <Badge variant="secondary" className="animate-pulse">
              Processing...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
            ${isDragActive 
              ? 'border-primary bg-primary/10' 
              : 'border-muted-foreground/25 hover:border-primary/50'
            }
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2">
            <Upload className={`w-8 h-8 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="text-sm">
              {isDragActive ? (
                <p className="font-medium">Drop files here to process</p>
              ) : (
                <>
                  <p className="font-medium">Drag & drop files here, or click to select</p>
                  <p className="text-muted-foreground">
                    Support: Images (screenshots), PDFs, text files • Max 20MB each
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Critical: Show processing queue with clear status */}
        {processingFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Processing Queue ({processingFiles.length})</h4>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setProcessingFiles([])}
                disabled={hasActiveFiles}
              >
                Clear Completed
              </Button>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {processingFiles.map((file) => (
                <Card key={file.id} className="p-3">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.file)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium truncate">
                          {file.file.name}
                        </p>
                        {getStatusIcon(file.status)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={file.progress} className="flex-1 h-2" />
                        <span className="text-xs text-muted-foreground">
                          {getStatusText(file.status)}
                        </span>
                      </div>
                      {file.error && (
                        <Alert className="mt-2">
                          <AlertTriangle className="w-4 h-4" />
                          <AlertDescription className="text-xs">
                            {file.error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {file.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryFile(file.id)}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      {!['extracting', 'rewriting'].includes(file.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Critical: Clear instructions */}
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-xs">
            <strong>How it works:</strong> Files are processed one at a time through AI rewriting 
            (same as RSS feeds). Completed articles appear in the arrivals queue below for review.
            Each file becomes a separate article.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};