import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Plus, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface StoryDraft {
  headline: string;
  author: string;
  publication: string;
  publishedAt: string;
  body: string;
  sourceUrl?: string;
}

interface AddStoryDialogProps {
  topicId: string;
  onContentProcessed: () => void;
}

type Mode = 'paste' | 'link' | 'file';

export const AddStoryDialog = ({ topicId, onContentProcessed }: AddStoryDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('paste');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [pendingFile, setPendingFile] = useState<{ bucket: string; path: string; fileName: string } | null>(null);

  const [pasteText, setPasteText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const reset = () => {
    setDraft(null);
    setError(null);
    setStatus('');
    setBusy(false);
    setPendingFile(null);
    setPasteText('');
    setLinkUrl('');
  };

  // supabase-js turns any non-2xx edge function response into a generic
  // "Edge Function returned a non-2xx status code" error. Read the response
  // body to surface the function's specific, user-friendly message instead.
  const extractFnErrorMessage = async (fnError: any): Promise<string> => {
    const response: Response | undefined = fnError?.context instanceof Response ? fnError.context : undefined;
    if (response) {
      try {
        const payload = await response.clone().json();
        if (payload && typeof payload.error === 'string' && payload.error.trim()) {
          return payload.error;
        }
      } catch {
        // Body wasn't JSON — fall through to the generic message.
      }
    }
    return 'The story service hit an unexpected problem. Please try again in a moment.';
  };

  const callExtract = async (body: Record<string, unknown>) => {
    const { data, error: fnError } = await supabase.functions.invoke('extract-content-from-upload', { body });
    if (fnError) throw new Error(await extractFnErrorMessage(fnError));
    if (!data?.success) throw new Error(data?.error || 'Extraction failed');
    return data;
  };

  const runExtraction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const data = await callExtract({ ...body, topicId });
      setDraft(data.draft as StoryDraft);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const handlePaste = () => {
    setStatus('Reading your text…');
    runExtraction({ mode: 'paste', text: pasteText });
  };

  const handleLink = () => {
    setStatus('Fetching the article…');
    runExtraction({ mode: 'link', url: linkUrl.trim() });
  };

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        setError(`"${file.name}" exceeds the 20MB limit.`);
        return;
      }

      setBusy(true);
      setError(null);
      setStatus(`Uploading ${file.name}…`);

      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error('You need to be signed in to add stories.');

        // The temp-uploads policy requires files live under <user-id>/
        const path = `${auth.user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('temp-uploads').upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        setPendingFile({ bucket: 'temp-uploads', path, fileName: file.name });
        setStatus(`Reading ${file.name}…`);

        const data = await callExtract({
          mode: 'file',
          topicId,
          storageBucket: 'temp-uploads',
          storagePath: path,
          fileName: file.name,
          fileType: file.type,
        });
        setDraft(data.draft as StoryDraft);
      } catch (err: any) {
        setError(err?.message || 'Could not read that file');
      } finally {
        setBusy(false);
        setStatus('');
      }
    },
    [topicId],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: busy,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
  });

  const handleCommit = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setStatus('Adding to arrivals…');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('extract-content-from-upload', {
        body: {
          mode,
          topicId,
          commit: true,
          story: draft,
          storageBucket: pendingFile?.bucket,
          storagePath: pendingFile?.path,
          fileName: pendingFile?.fileName,
        },
      });
      if (fnError) throw new Error(await extractFnErrorMessage(fnError));
      if (!data?.success) throw new Error(data?.error || 'Could not add the story');

      toast({
        title: data.duplicate ? 'Already in arrivals' : 'Story added',
        description: data.duplicate
          ? 'This story is already in the arrivals queue.'
          : `"${draft.headline}" is now in the arrivals queue.`,
      });
      onContentProcessed();
      reset();
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Could not add the story');
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Plus className="w-4 h-4" />
        Add story
      </Button>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a story</DialogTitle>
          <DialogDescription>
            Paste text, drop in a link, or upload a file. You'll be able to check the details before it goes to arrivals.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!draft ? (
          <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="paste">Paste</TabsTrigger>
              <TabsTrigger value="link">Link</TabsTrigger>
              <TabsTrigger value="file">File</TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="space-y-3 pt-4">
              <Label htmlFor="paste-text">Article text</Label>
              <Textarea
                id="paste-text"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the headline and article text here…"
                className="min-h-[220px]"
                disabled={busy}
              />
              <Button onClick={handlePaste} disabled={busy || pasteText.trim().length < 50} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? status || 'Working…' : 'Continue'}
              </Button>
            </TabsContent>

            <TabsContent value="link" className="space-y-3 pt-4">
              <Label htmlFor="link-url">Article URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com/news/story"
                disabled={busy}
              />
              <Button onClick={handleLink} disabled={busy || !linkUrl.trim()} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? status || 'Working…' : 'Fetch article'}
              </Button>
            </TabsContent>

            <TabsContent value="file" className="pt-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-10 text-center transition-all cursor-pointer ${
                  isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary/50'
                } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-2">
                  {busy ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  ) : (
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  )}
                  <p className="font-medium text-sm">{busy ? status || 'Working…' : 'Drag & drop a file, or click to select'}</p>
                  <p className="text-sm text-muted-foreground">Screenshots, PDFs, Word documents or text files • Max 20MB</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="draft-headline">Headline</Label>
              <Input
                id="draft-headline"
                value={draft.headline}
                onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="draft-author">Author</Label>
                <Input
                  id="draft-author"
                  value={draft.author}
                  placeholder="Unknown"
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-publication">Publication</Label>
                <Input
                  id="draft-publication"
                  value={draft.publication}
                  placeholder="e.g. Eastbourne Herald"
                  onChange={(e) => setDraft({ ...draft, publication: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-date">Published</Label>
                <Input
                  id="draft-date"
                  type="date"
                  value={draft.publishedAt?.slice(0, 10) ?? ''}
                  onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="draft-source">Source link (optional)</Label>
              <Input
                id="draft-source"
                value={draft.sourceUrl ?? ''}
                placeholder="https://…"
                onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="draft-body">Story text</Label>
              <Textarea
                id="draft-body"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="min-h-[260px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {draft.body.trim().split(/\s+/).filter(Boolean).length} words
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => { setDraft(null); setError(null); }} disabled={busy} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button onClick={handleCommit} disabled={busy || draft.body.trim().length < 50} className="gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {busy ? status || 'Working…' : 'Add to arrivals'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
