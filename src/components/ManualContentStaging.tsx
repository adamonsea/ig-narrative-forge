import React, { useState, useCallback, useEffect } from 'react';
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
  RotateCcw,
  CloudUpload
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageUrl?: string;
  status: 'uploading' | 'pending' | 'extracting' | 'rewriting' | 'saving' | 'completed' | 'failed';
  progress: number;
  extractedContent?: string;
  rewrittenContent?: string;
  error?: string;
  articleId?: string;
  uploadedAt?: string;
}

interface ManualContentStagingProps {
  topicId: string;
  onContentProcessed: () => void;
}

export const ManualContentStaging = ({ topicId, onContentProcessed }: ManualContentStagingProps) => {
  const STORAGE_KEY = `manual-content-staging-${topicId}`;
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Load queue from localStorage on mount
  useEffect(() => {
    const savedQueue = localStorage.getItem(STORAGE_KEY);
    if (savedQueue) {
      try {
        const parsed = JSON.parse(savedQueue);
        setProcessingFiles(parsed);
        
        // Auto-resume processing if there are pending files
        const hasPendingFiles = parsed.some((f: ProcessingFile) => 
          ['pending', 'extracting', 'rewriting', 'saving'].includes(f.status)
        );
        if (hasPendingFiles) {
          console.log('🔄 Auto-resuming processing from saved queue');
          setTimeout(() => processNextFile(parsed), 1000);
        }
      } catch (error) {
        console.error('Failed to load saved queue:', error);
      }
    }
  }, [topicId]);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    if (processingFiles.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(processingFiles));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [processingFiles]);

  // Process files one at a time with persistent storage
  const processNextFile = useCallback(async (queueOverride?: ProcessingFile[]) => {
    const currentQueue = queueOverride || processingFiles;
    const nextFile = currentQueue.find(f => f.status === 'pending');
    
    if (!nextFile || isProcessing) return;
    
    setIsProcessing(true);

    try {
      // Update status to extracting
      const updateStatus = (status: ProcessingFile['status'], progress: number, extra?: Partial<ProcessingFile>) => {
        setProcessingFiles(prev => prev.map(f => 
          f.id === nextFile.id 
            ? { ...f, status, progress, ...extra }
            : f
        ));
      };

      updateStatus('extracting', 30);
      console.log('📁 Processing file from storage:', nextFile.fileName);

      // Call content extraction function with storage URL
      const { data: extractResult, error: extractError } = await supabase.functions.invoke(
        'extract-content-from-upload',
        {
          body: {
            fileUrl: nextFile.storageUrl,
            fileName: nextFile.fileName,
            fileType: nextFile.fileType,
            topicId: topicId
          }
        }
      );

      if (extractError) throw new Error(`Extraction failed: ${extractError.message}`);
      if (!extractResult?.success) throw new Error(extractResult?.error || 'Extraction failed');

      if (!extractResult?.articleId) throw new Error('No article ID returned from processing');

      updateStatus('saving', 90);
      console.log('✅ Article created successfully:', extractResult.articleId);

      // Mark as completed
      updateStatus('completed', 100, { 
        rewrittenContent: extractResult.title || `Processed: ${nextFile.fileName}`,
        articleId: extractResult.articleId
      });

      // Clean up storage file after successful processing
      try {
        const storageKey = nextFile.storageUrl?.split('/').pop();
        if (storageKey) {
          await supabase.storage.from('temp-uploads').remove([storageKey]);
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup storage file:', cleanupError);
      }

      toast({
        title: "File Processed",
        description: `"${nextFile.fileName}" has been processed and added to the arrivals queue.`
      });

      onContentProcessed();

      // Process next file after brief delay
      setTimeout(() => {
        setIsProcessing(false);
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
        description: `Failed to process "${nextFile.fileName}": ${error.message}`,
        variant: "destructive"
      });

      setTimeout(() => {
        setIsProcessing(false);
        processNextFile();
      }, 500);
    }
  }, [processingFiles, topicId, onContentProcessed, toast, isProcessing]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Validate file types and sizes
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

    if (validFiles.length === 0) return;

    // Create files with uploading status
    const newFiles: ProcessingFile[] = validFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      status: 'uploading',
      progress: 0,
      uploadedAt: new Date().toISOString()
    }));

    setProcessingFiles(prev => [...prev, ...newFiles]);

    // Upload files to storage immediately
    for (const fileData of newFiles) {
      const originalFile = validFiles.find(f => f.name === fileData.fileName);
      if (!originalFile) continue;

      try {
        // Update status to show upload progress
        setProcessingFiles(prev => prev.map(f => 
          f.id === fileData.id 
            ? { ...f, progress: 10 }
            : f
        ));

        // Create unique storage path
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const storageKey = `${timestamp}-${random}-${fileData.fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('temp-uploads')
          .upload(storageKey, originalFile);

        if (uploadError) throw uploadError;

        // Get signed URL for processing
        const { data: urlData } = await supabase.storage
          .from('temp-uploads')
          .createSignedUrl(storageKey, 3600); // 1 hour expiry

        if (!urlData?.signedUrl) throw new Error('Failed to create signed URL');

        // Update file with storage URL and set to pending
        setProcessingFiles(prev => prev.map(f => 
          f.id === fileData.id 
            ? { 
                ...f, 
                status: 'pending' as const, 
                progress: 15,
                storageUrl: urlData.signedUrl
              }
            : f
        ));

        console.log('✅ File uploaded to storage:', fileData.fileName);

      } catch (error: any) {
        console.error('Upload failed:', error);
        setProcessingFiles(prev => prev.map(f => 
          f.id === fileData.id 
            ? { 
                ...f, 
                status: 'failed' as const, 
                progress: 0,
                error: `Upload failed: ${error.message}`
              }
            : f
        ));
      }
    }

    toast({
      title: "Files Added",
      description: `${validFiles.length} file${validFiles.length !== 1 ? 's' : ''} uploaded and queued for processing.`
    });

    // Start processing after all uploads complete
    setTimeout(() => processNextFile(), 2000);
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
        ? { ...f, status: 'pending', progress: 15, error: undefined }
        : f
    ));
    setTimeout(() => processNextFile(), 100);
  };

  const clearCompleted = () => {
    setProcessingFiles(prev => prev.filter(f => f.status !== 'completed'));
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <FileImage className="w-4 h-4" />;
    if (fileType === 'application/pdf') return <File className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getStatusIcon = (status: ProcessingFile['status']) => {
    switch (status) {
      case 'uploading': return <CloudUpload className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'extracting': return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'rewriting': return <Clock className="w-4 h-4 text-purple-500 animate-spin" />;
      case 'saving': return <Clock className="w-4 h-4 text-green-500 animate-spin" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = (status: ProcessingFile['status']) => {
    switch (status) {
      case 'uploading': return 'Uploading to storage...';
      case 'pending': return 'Waiting in queue...';
      case 'extracting': return 'Extracting content...';
      case 'rewriting': return 'AI rewriting & cleaning...';
      case 'saving': return 'Saving to database...';
      case 'completed': return 'Ready in arrivals queue';
      case 'failed': return 'Processing failed';
    }
  };

  const hasActiveFiles = processingFiles.some(f => 
    !['completed', 'failed'].includes(f.status)
  );

  const completedFiles = processingFiles.filter(f => f.status === 'completed').length;

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
              <h4 className="font-medium text-sm">
                Processing Queue ({processingFiles.length})
                {completedFiles > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {completedFiles} completed
                  </Badge>
                )}
              </h4>
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearCompleted}
                disabled={hasActiveFiles || completedFiles === 0}
              >
                Clear Completed
              </Button>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {processingFiles.map((file) => (
                <Card key={file.id} className="p-3">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.fileType)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium truncate">
                          {file.fileName}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round(file.fileSize / 1024)}KB)
                        </span>
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
                      {file.status === 'failed' && file.storageUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryFile(file.id)}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      {!['extracting', 'rewriting', 'saving'].includes(file.status) && (
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

        {/* Improved instructions */}
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-xs">
            <strong>How it works:</strong> Files are uploaded to secure storage, then processed 
            one at a time through AI extraction and rewriting. Your queue persists across page 
            reloads. Completed articles appear in the arrivals queue below for review.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};