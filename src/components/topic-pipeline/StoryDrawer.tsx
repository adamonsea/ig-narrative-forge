import React, { useState } from "react";
import { formatDistanceToNow, format, isFuture } from "date-fns";
import { Archive, Clock, ExternalLink, Film, ImageIcon, Link as LinkIcon, Loader2, MoreHorizontal, Pin, PinOff, RotateCcw, Save, Trash2, Zap } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ImageModelSelector, type ImageModel } from "@/components/ImageModelSelector";
import { LinkEditor } from "@/components/LinkEditor";
import { ReelExportButton } from "@/components/reels/ReelExportButton";
import { DeskBadge, MetaLine } from "./DeskCard";
import { PIN_LENGTHS, pinTimeLeft } from "@/lib/storyPin";

export interface StoryLink {
  start: number;
  end: number;
  url: string;
  text: string;
}

export interface StorySlide {
  id: string;
  slide_number: number;
  content: string;
  word_count?: number | undefined;
  alt_text?: string | undefined;
  visual_prompt?: string | undefined;
  links?: StoryLink[] | undefined;
}

export interface PublishedStory {
  id: string;
  title?: string | undefined;
  headline?: string | undefined;
  summary?: string | undefined;
  author?: string | undefined;
  publication_name?: string | null | undefined;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  slides: StorySlide[];
  slide_count?: number | undefined;
  slides_load_failed?: boolean | undefined;
  article_id?: string | undefined;
  topic_article_id?: string | undefined;
  story_type?: "legacy" | "multi_tenant" | undefined;
  cover_illustration_url?: string | null | undefined;
  cover_illustration_prompt?: string | null | undefined;
  illustration_generated_at?: string | null | undefined;
  animated_illustration_url?: string | null | undefined;
  animation_suggestions?: string[] | null | undefined;
  is_parliamentary?: boolean | undefined;
  scheduled_publish_at?: string | null | undefined;
  source_url?: string | null | undefined;
}

function renderContentWithLinks(content: string, links: StoryLink[] = []) {
  if (!links || links.length === 0) return <span>{content}</span>;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  [...links].sort((a, b) => a.start - b.start).forEach((link, index) => {
    if (link.start > lastIndex) parts.push(<span key={`text-${index}`}>{content.substring(lastIndex, link.start)}</span>);
    parts.push(
      <a key={`link-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        {link.text}<ExternalLink className="h-3.5 w-3.5" />
      </a>,
    );
    lastIndex = link.end;
  });
  if (lastIndex < content.length) parts.push(<span key="text-end">{content.substring(lastIndex)}</span>);
  return <>{parts}</>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border px-6 py-6">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

interface StoryDrawerProps {
  story: PublishedStory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLabel: string;
  topicSlug?: string | undefined;
  illustrationStyle: string;
  generating: boolean;
  animating: boolean;
  publishing: boolean;
  onGenerateIllustration: (model: ImageModel, style?: string) => void;
  onAnimate: () => void;
  onDeleteAnimation: () => void;
  onDeleteIllustration: () => void;
  onReel: () => void;
  onPublishNow: () => void;
  onUnpublish: () => void;
  onAssignTime?: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  /** When this story's pin ends (null when it isn't pinned). */
  pinnedUntil?: string | null | undefined;
  /** Another story is pinned: pinning this one replaces it. */
  otherPinned?: boolean | undefined;
  /** Pin this live story for a number of hours; 0 unpins. Live now only. */
  onPin?: (hours: number) => Promise<void>;
}

/** Everything about one story, one click away: picture, words, sharing and housekeeping. */
export function StoryDrawer({
  story, open, onOpenChange, sourceLabel, topicSlug, illustrationStyle, generating, animating, publishing,
  onGenerateIllustration, onAnimate, onDeleteAnimation, onDeleteIllustration, onReel, onPublishNow, onUnpublish, onAssignTime, onArchive, onDelete, onRefresh,
  pinnedUntil = null, otherPinned = false, onPin,
}: StoryDrawerProps) {
  const { toast } = useToast();
  const [pinning, setPinning] = useState(false);
  const pin = async (hours: number) => {
    if (!onPin) return;
    setPinning(true);
    try { await onPin(hours); } finally { setPinning(false); }
  };
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [linkEditorSlide, setLinkEditorSlide] = useState<StorySlide | null>(null);

  const saveSlide = async (slideId: string) => {
    const content = edits[slideId];
    if (content === undefined) return;
    setSaving((prev) => new Set([...prev, slideId]));
    try {
      const wordCount = content.trim().split(/\s+/).filter((w) => w.length > 0).length;
      const { error } = await supabase.from("slides").update({ content, word_count: wordCount, updated_at: new Date().toISOString() }).eq("id", slideId);
      if (error) throw error;
      toast({ title: "Slide saved", description: "Changes saved." });
      setEdits((prev) => { const next = { ...prev }; delete next[slideId]; return next; });
      setTimeout(() => onRefresh(), 500);
    } catch (e) {
      console.error("Error saving slide", e);
      toast({ title: "Save failed", description: "Could not save slide", variant: "destructive" });
    } finally {
      setSaving((prev) => { const n = new Set(prev); n.delete(slideId); return n; });
    }
  };

  const handleSaveLinks = async (slide: StorySlide, links: StoryLink[]) => {
    try {
      const { error } = await supabase.from("slides").update({ links: links as any, updated_at: new Date().toISOString() }).eq("id", slide.id);
      if (error) throw error;
      toast({ title: "Links saved", description: `${links.length} links updated` });
      setTimeout(() => onRefresh(), 500);
    } catch (error) {
      console.error("Error saving links:", error);
      toast({ title: "Error", description: "Failed to save links", variant: "destructive" });
    }
  };

  const isScheduled = Boolean(story?.scheduled_publish_at && isFuture(new Date(story.scheduled_publish_at)));
  const isLive = story?.status === "published" && !isScheduled;
  const isReady = story?.status === "ready" && !isScheduled;
  const isDraft = story?.status === "draft";
  const title = story ? story.title || story.headline || "Untitled" : "";
  const slideCount = story ? story.slide_count ?? story.slides.length : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="panel" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {story && (
          <>
            <SheetHeader className="space-y-3 p-6 pr-12 text-left">
              {story.cover_illustration_url && (
                <div className={story.animated_illustration_url ? "grid grid-cols-2 gap-3" : ""}>
                  <img src={story.cover_illustration_url} alt="" className="aspect-square w-full rounded-lg border border-border bg-muted object-cover" />
                  {story.animated_illustration_url && (
                    <video src={story.animated_illustration_url} poster={story.cover_illustration_url} className="aspect-square w-full rounded-lg border border-border bg-muted object-cover" controls loop muted playsInline aria-label="Animated picture" />
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {isScheduled && <DeskBadge><Clock className="h-3.5 w-3.5" aria-hidden="true" />{format(new Date(story.scheduled_publish_at!), "d MMM, HH:mm")}</DeskBadge>}
                {isReady && <DeskBadge tone="primary">Ready</DeskBadge>}
                {isDraft && <DeskBadge>Draft</DeskBadge>}
                {story.is_parliamentary && <DeskBadge>Parliament</DeskBadge>}
              </div>
              <SheetTitle className="text-lg leading-snug">{title}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <MetaLine parts={[
                    sourceLabel,
                    formatDistanceToNow(new Date(story.created_at), { addSuffix: true }),
                    `${slideCount} ${slideCount === 1 ? "slide" : "slides"}`,
                    story.author ? `By ${story.author}` : null,
                  ]} />
                </div>
              </SheetDescription>
            </SheetHeader>

            <Section title="Picture">
              <div className="flex flex-wrap items-center gap-2">
                <ImageModelSelector
                  onModelSelect={(model, style) => onGenerateIllustration(model, style)}
                  isGenerating={generating}
                  hasExistingImage={!!story.cover_illustration_url}
                  illustrationStyle={illustrationStyle as any}
                  size="sm"
                />
                {story.cover_illustration_url && !story.animated_illustration_url && (
                  <Button variant="outline" size="sm" onClick={onAnimate} disabled={animating}>
                    {animating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                    Animate
                  </Button>
                )}
                {story.animated_illustration_url && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDeleteAnimation}>
                    <Film className="mr-2 h-4 w-4" />Delete animation
                  </Button>
                )}
                {story.cover_illustration_url && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDeleteIllustration}>
                    <ImageIcon className="mr-2 h-4 w-4" />Delete picture
                  </Button>
                )}
              </div>
            </Section>

            <Section title="Words">
              {story.slides_load_failed && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                  <span>Slides are still loading.</span>
                  <Button size="sm" variant="ghost" onClick={onRefresh}>Reload slides</Button>
                </div>
              )}
              <div className="space-y-3">
                {story.slides.map((slide, index) => (
                  <div key={slide.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Slide {slide.slide_number || index + 1}</span>
                      <span className="tabular-nums">{slide.word_count || 0} words</span>
                    </div>
                    {edits[slide.id] !== undefined ? (
                      <textarea
                        value={edits[slide.id]}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [slide.id]: e.target.value }))}
                        className="min-h-[120px] w-full resize-y rounded-md border border-input bg-background p-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Slide text…"
                        aria-label={`Slide ${slide.slide_number || index + 1} text`}
                      />
                    ) : (
                      <p className="text-base leading-relaxed">{renderContentWithLinks(slide.content, slide.links)}</p>
                    )}
                    <div className="flex items-center gap-2">
                      {edits[slide.id] !== undefined ? (
                        <>
                          <Button size="sm" onClick={() => saveSlide(slide.id)} disabled={saving.has(slide.id)}>
                            <Save className="mr-2 h-4 w-4" />{saving.has(slide.id) ? "Saving…" : "Save"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEdits((prev) => { const next = { ...prev }; delete next[slide.id]; return next; })}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEdits((prev) => ({ ...prev, [slide.id]: slide.content }))}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => setLinkEditorSlide(slide)}>
                            <LinkIcon className="mr-2 h-4 w-4" />Links ({slide.links?.length || 0})
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {isLive && onPin && (
              <Section title="Pin to top">
                {pinnedUntil ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <DeskBadge tone="primary"><Pin className="h-3.5 w-3.5" aria-hidden="true" />Pinned · {pinTimeLeft(pinnedUntil)}</DeskBadge>
                    <Button variant="ghost" size="sm" onClick={() => pin(0)} disabled={pinning}>
                      <PinOff className="mr-2 h-4 w-4" />Unpin
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {PIN_LENGTHS.map((p) => (
                      <Button
                        key={p.hours}
                        variant="outline"
                        size="sm"
                        onClick={() => pin(p.hours)}
                        disabled={pinning}
                        title={otherPinned ? "Replaces the pinned story" : undefined}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {isLive && (
              <Section title="Share">
                <div className="flex flex-wrap items-center gap-2">
                  {topicSlug && (
                    <Button size="sm" asChild>
                      <a href={`/feed/${topicSlug}/story/${story.id}`} target="_blank" rel="noopener noreferrer">View in feed</a>
                    </Button>
                  )}
                  <ReelExportButton onClick={onReel} />
                </div>
              </Section>
            )}

            <div className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-border bg-background px-6 py-4">
              {story.source_url ? (
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                  <a href={story.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Source article</a>
                </Button>
              ) : <span />}
              <div className="ml-auto flex items-center gap-2">
                {!isLive && (
                  <Button size="sm" onClick={onPublishNow} disabled={publishing}>
                    {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}Publish now
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isDraft && (
                      <DropdownMenuItem onClick={onUnpublish}><RotateCcw className="mr-2 h-4 w-4" />Unpublish</DropdownMenuItem>
                    )}
                    {isReady && onAssignTime && (
                      <DropdownMenuItem onClick={onAssignTime}><Clock className="mr-2 h-4 w-4" />Assign time</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onArchive}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>
                    <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        )}
        {linkEditorSlide && (
          <LinkEditor
            content={linkEditorSlide.content}
            existingLinks={linkEditorSlide.links || []}
            onSaveLinks={(links) => handleSaveLinks(linkEditorSlide, links)}
            open={!!linkEditorSlide}
            onClose={() => setLinkEditorSlide(null)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
