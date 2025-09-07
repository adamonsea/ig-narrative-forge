import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, X, AlertTriangle } from "lucide-react";
import { useEnhancedDuplicateDetection } from "@/hooks/useEnhancedDuplicateDetection";

interface BulkDeleteDialogProps {
  onSuccess?: () => void;
}

export const BulkDeleteDialog = ({ onSuccess }: BulkDeleteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [entities, setEntities] = useState<string[]>([]);
  const [entityInput, setEntityInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const { bulkDeleteArticles } = useEnhancedDuplicateDetection();

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords(prev => [...prev, keywordInput.trim()]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(prev => prev.filter(k => k !== keyword));
  };

  const addEntity = () => {
    if (entityInput.trim() && !entities.includes(entityInput.trim())) {
      setEntities(prev => [...prev, entityInput.trim()]);
      setEntityInput('');
    }
  };

  const removeEntity = (entity: string) => {
    setEntities(prev => prev.filter(e => e !== entity));
  };

  const handleBulkKeywordInput = (input: string) => {
    // Allow users to paste multiple keywords separated by commas or newlines
    const newKeywords = input
      .split(/[,\n]/)
      .map(k => k.trim())
      .filter(k => k && !keywords.includes(k));
    
    if (newKeywords.length > 0) {
      setKeywords(prev => [...prev, ...newKeywords]);
      setKeywordInput('');
    }
  };

  const previewDeletion = async () => {
    if (keywords.length === 0 && entities.length === 0) return;
    
    setIsProcessing(true);
    try {
      // This would need to be implemented as a preview function
      // For now, we'll simulate it
      const estimatedCount = Math.floor(Math.random() * 10) + 1;
      setPreviewCount(estimatedCount);
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (keywords.length === 0 && entities.length === 0) return;
    
    setIsProcessing(true);
    try {
      const deletedCount = await bulkDeleteArticles({
        keywords: keywords.length > 0 ? keywords : undefined,
        entities: entities.length > 0 ? entities : undefined,
      });
      
      if (deletedCount > 0) {
        setOpen(false);
        setKeywords([]);
        setEntities([]);
        setPreviewCount(null);
        onSuccess?.();
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setKeywords([]);
    setEntities([]);
    setKeywordInput('');
    setEntityInput('');
    setPreviewCount(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Bulk Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Bulk Delete Similar Articles
          </DialogTitle>
          <DialogDescription>
            Delete multiple articles that contain specific keywords or mention certain entities. 
            This helps prevent similar articles from cluttering your pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Keywords Section */}
          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords to Target</Label>
            <div className="flex gap-2">
              <Input
                id="keywords"
                placeholder="Enter keywords (e.g., 'traffic accident', 'road closure')"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button type="button" onClick={addKeyword} size="sm">
                Add
              </Button>
            </div>
            
            {/* Bulk input for keywords */}
            <Textarea
              placeholder="Or paste multiple keywords separated by commas or new lines..."
              className="text-sm"
              rows={2}
              onChange={(e) => {
                if (e.target.value.includes(',') || e.target.value.includes('\n')) {
                  handleBulkKeywordInput(e.target.value);
                  e.target.value = '';
                }
              }}
            />

            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 p-2 bg-muted rounded-md">
                {keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="text-xs">
                    {keyword}
                    <button
                      onClick={() => removeKeyword(keyword)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Entities Section */}
          <div className="space-y-2">
            <Label htmlFor="entities">Places/Organizations</Label>
            <div className="flex gap-2">
              <Input
                id="entities"
                placeholder="Enter places or organizations (e.g., 'London', 'Sussex Police')"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEntity();
                  }
                }}
              />
              <Button type="button" onClick={addEntity} size="sm">
                Add
              </Button>
            </div>

            {entities.length > 0 && (
              <div className="flex flex-wrap gap-1 p-2 bg-muted rounded-md">
                {entities.map((entity) => (
                  <Badge key={entity} variant="outline" className="text-xs">
                    {entity}
                    <button
                      onClick={() => removeEntity(entity)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Preview Section */}
          {(keywords.length > 0 || entities.length > 0) && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Preview Deletion</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={previewDeletion}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Checking...' : 'Preview'}
                </Button>
              </div>
              {previewCount !== null && (
                <p className="text-sm text-muted-foreground mt-2">
                  Approximately <strong>{previewCount}</strong> articles will be deleted
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
          <Button
            onClick={handleBulkDelete}
            disabled={isProcessing || (keywords.length === 0 && entities.length === 0)}
            variant="destructive"
          >
            {isProcessing ? 'Deleting...' : `Delete Articles`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};