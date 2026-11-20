import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Copy, ExternalLink, ImageIcon, Loader2, MoreHorizontal, PlayCircle, Shield, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import type { DuplicateInfo } from "@/lib/titleSimilarity";
import { getCurrentnessTag } from "@/lib/dateUtils";
import { highlightContentWithContext, type HighlightTerms } from "@/lib/highlightTerms";
import { DeskBadge, MetaLine } from "./DeskCard";

export type SlideLength = "short" | "tabloid" | "indepth" | "extensive";
export type StoryTone = "formal" | "conversational" | "engaging" | "satirical" | "rhyming_couplet";
export type WritingStyle = "journalistic" | "educational" | "listicle" | "story_driven";

const sourceDomain = (url: string) => {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
};

interface WaitingStoryDrawerProps {
  article: MultiTenantArticle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dupInfo?: DuplicateInfo | undefined;
  slideType: SlideLength;
  tone: StoryTone;
  writingStyle: WritingStyle;
  onSlideType: (v: SlideLength) => void;
  onTone: (v: StoryTone) => void;
  onWritingStyle: (v: WritingStyle) => void;
  makePicture: boolean;
  onMakePicture: (on: boolean) => void;
  highlightTerms?: HighlightTerms | undefined;
  isProcessing: boolean;
  isDeleting: boolean;
  onPublish: () => void;
  /** "Add to queue" on scheduled feeds, otherwise "Publish". */
  publishLabel?: string | undefined;
  onSkip: () => void;
  onSuppress?: () => void;
}

/** A waiting article in full: why it matched, the original text, and how it will be written. */
export function WaitingStoryDrawer({
  article, open, onOpenChange, dupInfo, slideType, tone, writingStyle, onSlideType, onTone, onWritingStyle,
  makePicture, onMakePicture, highlightTerms, isProcessing, isDeleting, onPublish, publishLabel = "Publish", onSkip, onSuppress,
}: WaitingStoryDrawerProps) {
  const [body, setBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  // The original text: the article's own body, or the shared copy fetched on open (as the old preview did).
  useEffect(() => {
    if (!open || !article) return;
    setBody(article.body ?? null);
    if (!article.shared_content_id) return;
    let cancelled = false;
    setLoadingBody(true);
    (async () => {
      try {
        const { data, error } = await supabase.from("shared_article_content").select("body").eq("id", article.shared_content_id!).single();
        if (!cancelled && !error && data?.body) setBody(data.body);
      } catch (err) {
        console.error("Error fetching article body:", err);
      } finally {
        if (!cancelled) setLoadingBody(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, article?.id, article?.shared_content_id]);

  const terms: HighlightTerms = highlightTerms ?? { regionName: "", landmarks: [], keywords: [], organizations: [] };
  const happened = article ? article.published_at || article.created_at : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="panel" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {article && (
          <>
            <SheetHeader className="space-y-3 p-6 pr-12 text-left">
              {article.image_url && (
                <img src={article.image_url} alt="" referrerPolicy="no-referrer" className="aspect-video w-full rounded-lg border border-border bg-muted object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <SheetTitle className="text-lg leading-snug">
                <span dangerouslySetInnerHTML={{ __html: highlightContentWithContext(article.title, terms) }} />
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <MetaLine parts={[
                    sourceDomain(article.url),
                    happened ? formatDistanceToNow(new Date(happened), { addSuffix: true }) : null,
                    article.author ? `By ${article.author}` : null,
                    article.word_count ? `${article.word_count} words` : null,
                  ]} />
                </div>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <DeskBadge tone="primary">{article.regional_relevance_score}% relevant</DeskBadge>
                <DeskBadge>{getCurrentnessTag(article.published_at, article.created_at)}</DeskBadge>
                {article.is_snippet && <DeskBadge>Snippet</DeskBadge>}
                {(article.keyword_matches || []).map((k) => <DeskBadge key={k}>{k}</DeskBadge>)}
              </div>
              {dupInfo && (
                <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <p className="flex items-center gap-2 font-medium"><Copy className="h-4 w-4" aria-hidden="true" />{dupInfo.isDuplicateLeader ? "Also reported as:" : "Similar to:"}</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {dupInfo.similarTitles.map((t, i) => <li key={i} className="truncate">• {t}</li>)}
                  </ul>
                </div>
              )}
            </SheetHeader>

            <section className="space-y-4 border-t border-border px-6 py-6">
              <h3 className="text-sm font-medium text-muted-foreground">How it will be written</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-sm">Length</Label>
                  <Select value={slideType} onValueChange={(v) => onSlideType(v as SlideLength)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">3 slides</SelectItem>
                      <SelectItem value="tabloid">6 slides</SelectItem>
                      <SelectItem value="indepth">8 slides</SelectItem>
                      <SelectItem value="extensive">12 slides</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Tone</Label>
                  <Select value={tone} onValueChange={(v) => onTone(v as StoryTone)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="conversational">Conversational</SelectItem>
                      <SelectItem value="engaging">Engaging</SelectItem>
                      <SelectItem value="satirical">Satirical</SelectItem>
                      <SelectItem value="rhyming_couplet">Rhyming</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Writing style</Label>
                  <Select value={writingStyle} onValueChange={(v) => onWritingStyle(v as WritingStyle)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="journalistic">Journalistic</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="listicle">Listicle</SelectItem>
                      <SelectItem value="story_driven">Story-driven</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="waiting-make-picture" className="flex items-center gap-2 text-base font-normal">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Make a picture
                </Label>
                <Switch id="waiting-make-picture" checked={makePicture} onCheckedChange={onMakePicture} />
              </div>
            </section>

            <section className="space-y-3 border-t border-border px-6 py-6">
              <h3 className="text-sm font-medium text-muted-foreground">Original</h3>
              {loadingBody && !body ? (
                <div className="space-y-2" aria-label="Loading the original" role="status"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-4/5" /></div>
              ) : body ? (
                <div className="whitespace-pre-wrap text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightContentWithContext(body, terms) }} />
              ) : (
                <p className="text-sm text-muted-foreground">No article text to preview.</p>
              )}
            </section>

            <div className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-border bg-background px-6 py-4">
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                <a href={article.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Source</a>
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onSkip} disabled={isDeleting}>Skip</Button>
                <Button size="sm" onClick={onPublish} disabled={isProcessing || isDeleting} className="min-w-[96px]">
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}{publishLabel}
                </Button>
                {onSuppress && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={onSuppress}><Shield className="mr-2 h-4 w-4" />Never show this again</DropdownMenuItem>
                      <DropdownMenuItem onClick={onSkip} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
