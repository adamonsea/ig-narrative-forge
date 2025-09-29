import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Check, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CoverOption {
  id: string;
  cover_url: string;
  generation_prompt?: string;
  model_used?: string;
  generated_at: string;
}

interface CoverSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle: string;
  coverOptions: CoverOption[];
  selectedCoverId?: string;
  onCoverUpdated: () => void;
}

export const CoverSelectionModal: React.FC<CoverSelectionModalProps> = ({
  isOpen,
  onClose,
  storyId,
  storyTitle,
  coverOptions,
  selectedCoverId,
  onCoverUpdated
}) => {
  const [selecting, setSelecting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSelectCover = async (coverOptionId: string) => {
    if (coverOptionId === selectedCoverId) return;
    
    setSelecting(coverOptionId);
    
    try {
      const { data, error } = await supabase.functions.invoke('select-story-cover', {
        body: { storyId, coverOptionId }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast({
        title: "Cover Updated",
        description: "Story cover has been successfully updated.",
      });

      onCoverUpdated();
    } catch (error) {
      console.error('Error selecting cover:', error);
      toast({
        title: "Failed to Update Cover",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSelecting(null);
    }
  };

  const handleDeleteCover = async (coverOptionId: string) => {
    if (coverOptions.length <= 1) {
      toast({
        title: "Cannot Delete",
        description: "You must keep at least one cover option.",
        variant: "destructive",
      });
      return;
    }

    setDeleting(coverOptionId);
    
    try {
      const { data, error } = await supabase.functions.invoke('delete-cover-option', {
        body: { coverOptionId }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast({
        title: "Cover Deleted",
        description: data.wasSelected 
          ? "Cover deleted and a new one was automatically selected."
          : "Cover option deleted successfully.",
      });

      onCoverUpdated();
    } catch (error) {
      console.error('Error deleting cover:', error);
      toast({
        title: "Failed to Delete Cover",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Select Cover for "{storyTitle}"
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {coverOptions.map((option) => (
              <div
                key={option.id}
                className={`relative group border-2 rounded-lg overflow-hidden transition-all ${
                  option.id === selectedCoverId 
                    ? 'border-primary ring-2 ring-primary/20' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="aspect-square relative">
                  <img
                    src={option.cover_url}
                    alt="Cover option"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  
                  {/* Selection overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex gap-2">
                      {option.id !== selectedCoverId && (
                        <Button
                          size="sm"
                          onClick={() => handleSelectCover(option.id)}
                          disabled={selecting === option.id}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {selecting === option.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Select
                            </>
                          )}
                        </Button>
                      )}
                      
                      {coverOptions.length > 1 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmDelete(option.id)}
                          disabled={deleting === option.id}
                        >
                          {deleting === option.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Selected badge */}
                  {option.id === selectedCoverId && (
                    <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">
                      <Check className="h-3 w-3 mr-1" />
                      Selected
                    </Badge>
                  )}
                </div>

                {/* Cover info */}
                <div className="p-2 bg-card">
                  <div className="text-xs text-muted-foreground mb-1">
                    {option.model_used && (
                      <Badge variant="secondary" className="mr-1 text-xs">
                        {option.model_used}
                      </Badge>
                    )}
                    {new Date(option.generated_at).toLocaleDateString()}
                  </div>
                  {option.generation_prompt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {option.generation_prompt}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cover Option</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this cover option? This action cannot be undone.
              {confirmDelete === selectedCoverId && (
                <span className="block mt-2 text-amber-600 font-medium">
                  This is the currently selected cover. Another cover will be automatically selected.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDeleteCover(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Cover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};