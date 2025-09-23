import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ExternalLink, Plus } from 'lucide-react';

interface Link {
  start: number;
  end: number;
  url: string;
  text: string;
}

interface LinkEditorProps {
  content: string;
  existingLinks: Link[];
  onSaveLinks: (links: Link[]) => void;
  open: boolean;
  onClose: () => void;
}

export const LinkEditor: React.FC<LinkEditorProps> = ({
  content,
  existingLinks,
  onSaveLinks,
  open,
  onClose
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [textStart, setTextStart] = useState(0);
  const [textEnd, setTextEnd] = useState(0);
  const [links, setLinks] = useState<Link[]>(existingLinks);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      const selectedContent = selection.toString().trim();
      
      // Calculate approximate positions in the content
      const beforeSelection = content.substring(0, content.indexOf(selectedContent));
      const start = beforeSelection.length;
      const end = start + selectedContent.length;
      
      setSelectedText(selectedContent);
      setLinkText(selectedContent);
      setTextStart(start);
      setTextEnd(end);
    }
  };

  const addLink = () => {
    if (!linkUrl.trim() || !linkText.trim()) return;
    
    const newLink: Link = {
      start: textStart,
      end: textEnd,
      url: linkUrl.trim(),
      text: linkText.trim()
    };
    
    const updatedLinks = [...links, newLink].sort((a, b) => a.start - b.start);
    setLinks(updatedLinks);
    
    // Clear form
    setSelectedText('');
    setLinkUrl('');
    setLinkText('');
    setTextStart(0);
    setTextEnd(0);
  };

  const removeLink = (index: number) => {
    const updatedLinks = links.filter((_, i) => i !== index);
    setLinks(updatedLinks);
  };

  const handleSave = () => {
    onSaveLinks(links);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Manage Links
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Content Preview with Selection Instructions */}
          <div>
            <Label className="text-sm font-medium">Content</Label>
            <div 
              className="mt-2 p-3 border rounded-lg bg-muted/30 text-sm leading-relaxed cursor-text select-text"
              onMouseUp={handleTextSelection}
            >
              {content}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Select text above to create a link
            </p>
          </div>

          {/* Add Link Form */}
          <div className="space-y-4 p-4 border rounded-lg bg-background">
            <h4 className="font-medium text-sm">Add New Link</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="linkText" className="text-xs">Link Text</Label>
                <Input
                  id="linkText"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Text to display"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="linkUrl" className="text-xs">URL</Label>
                <Input
                  id="linkUrl"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-8 text-sm"
                />
              </div>
            </div>
            
            <Button 
              size="sm" 
              onClick={addLink}
              disabled={!linkText.trim() || !linkUrl.trim()}
              className="h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Link
            </Button>
          </div>

          {/* Existing Links */}
          {links.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Current Links ({links.length})</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {links.map((link, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{link.text}</span>
                      <span className="text-muted-foreground text-xs ml-2">→ {link.url}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeLink(index)}
                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Links
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
