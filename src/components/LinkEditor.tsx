import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

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
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="panel" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-lg">Links</SheetTitle>
        </SheetHeader>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Select words to link</Label>
          <div
            className="cursor-text select-text rounded-lg border bg-muted/30 p-3 text-base leading-relaxed"
            onMouseUp={handleTextSelection}
          >
            {content}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="linkText" className="text-sm">Words</Label>
            <Input id="linkText" value={linkText} onChange={(e) => setLinkText(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkUrl" className="text-sm">Address</Label>
            <Input id="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" />
          </div>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={addLink} disabled={!linkText.trim() || !linkUrl.trim()}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </div>

        {links.length > 0 && (
          <ul className="space-y-2">
            {links.map((link, index) => (
              <li key={index} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-base">
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{link.text}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{link.url}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeLink(index)}
                  aria-label={`Remove link ${link.text}`}
                  title="Remove link"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
