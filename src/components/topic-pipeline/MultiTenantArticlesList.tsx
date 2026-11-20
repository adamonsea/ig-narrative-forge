import { opt } from "@/lib/optionalProps";
import React, { useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, Copy, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { DuplicateInfo } from "@/lib/titleSimilarity";
import type { HighlightTerms } from "@/lib/highlightTerms";
import { DeskBadge, DeskCard, MetaLine, PublishSplitButton, ShelfLabel, SpikeButton } from "./DeskCard";
import { holdReasonTag } from "@/lib/holdReason";
import { WaitingStoryDrawer } from "./WaitingStoryDrawer";

interface MultiTenantArticlesListProps {
  articles: MultiTenantArticle[];
  processingArticle: string | null;
  deletingArticles: Set<string>;
  animatingArticles: Set<string>;
  
  defaultSlideQuantity?: 'short' | 'tabloid' | 'indepth' | 'extensive' | undefined;
  defaultTone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined;
  defaultWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined;
  
  slideQuantityOverrides?: Record<string, 'short' | 'tabloid' | 'indepth' | 'extensive'> | undefined;
  toneOverrides?: Record<string, 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined> | undefined;  
  writingStyleOverrides?: Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined> | undefined;
  
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet') => void;
  onWritingStyleOverrideChange: (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  
  /** The feed's region, landmarks, keywords and organisations, highlighted in the drawer's article preview. */
  highlightTerms?: HighlightTerms | undefined;
  onApprove: (article: MultiTenantArticle, slideType?: 'short' | 'tabloid' | 'indepth' | 'extensive', tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet', writingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven', generateIllustration?: boolean) => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  onDiscardAndSuppress?: (articleId: string, topicId: string, articleUrl: string, articleTitle: string) => void;
  onBulkDelete?: (articleIds: string[]) => void;
  onPromote?: (articleId: string) => void;
  topicId?: string | undefined;
  onRefresh?: () => void;
  duplicateMap?: Map<string, DuplicateInfo> | undefined;
  
  hasMoreArticles?: boolean | undefined;
  totalArticlesCount?: number | null | undefined;
  loadingMore?: boolean | undefined;
  onLoadMore?: () => void;
  /** The feed's Autopilot quality bar, or null when Autopilot is off (no reason tags then). */
  autopilotBar?: number | null | undefined;
}

export default function MultiTenantArticlesList({
  articles,
  processingArticle,
  deletingArticles,
  animatingArticles,
  defaultSlideQuantity = 'tabloid',
  defaultTone = 'conversational',
  defaultWritingStyle = 'journalistic',
  slideQuantityOverrides = {},
  toneOverrides = {},
  writingStyleOverrides = {},
  onSlideQuantityChange,
  onToneOverrideChange,
  onWritingStyleOverrideChange,
  highlightTerms,
  onApprove,
  onDelete,
  onDiscardAndSuppress,
  onBulkDelete,
  onPromote,
  topicId,
  onRefresh,
  duplicateMap,
  hasMoreArticles = false,
  totalArticlesCount = null,
  loadingMore = false,
  onLoadMore,
  autopilotBar = null,
}: MultiTenantArticlesListProps) {
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [bulkDeleteRelevanceThreshold, setBulkDeleteRelevanceThreshold] = useState(25);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleteCount, setBulkDeleteCount] = useState<number | null>(null);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [illustrationOverrides, setIllustrationOverrides] = useState<Record<string, boolean>>({});
  // Duplicates from other sources are hidden behind their leader by default.
  const [showAllDuplicates, setShowAllDuplicates] = useState(false);
  const [expandedDuplicateGroups, setExpandedDuplicateGroups] = useState<Set<string>>(new Set());
  const prefersReducedMotion = useReducedMotion();

  const toggleDuplicateGroup = (groupId: string) => {
    setExpandedDuplicateGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const visibleArticles = articles.filter(article => {
    const info = duplicateMap?.get(article.id);
    if (!info || info.isDuplicateLeader) return true;
    return showAllDuplicates || expandedDuplicateGroups.has(info.duplicateGroupId);
  });

  useEffect(() => {
    if (articles.length === 0) {
      setSelectedArticles(new Set());
      setSelectMode(false);
      setBulkDeleteCount(null);
    }
  }, [articles.length]);

  const handleBulkDelete = () => {
    if (selectedArticles.size === 0) return;
    setBulkDeleteCount(selectedArticles.size);
    onBulkDelete?.(Array.from(selectedArticles));
    setSelectedArticles(new Set());
    setSelectMode(false);
    setTimeout(() => setBulkDeleteCount(null), 3000);
  };

  const handleBulkDeleteByRelevance = () => {
    const lowRelevanceIds = articles
      .filter(article => article.regional_relevance_score < bulkDeleteRelevanceThreshold)
      .map(article => article.id);
    if (lowRelevanceIds.length === 0) return;
    setBulkDeleteCount(lowRelevanceIds.length);
    onBulkDelete?.(lowRelevanceIds);
    setTimeout(() => setBulkDeleteCount(null), 3000);
  };

  const handleSelectAll = () => {
    setSelectedArticles(new Set(articles.map(a => a.id)));
  };

  const handleDeselectAll = () => {
    setSelectedArticles(new Set());
  };

  const getSourceDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  const slideTypeFor = (article: MultiTenantArticle) =>
    slideQuantityOverrides[article.id] || (article.is_snippet ? 'short' : defaultSlideQuantity);

  /** Publish = write it now with the feed's defaults (or the drawer's choices); warns on a second version of a covered story. */
  const publishArticle = (
    article: MultiTenantArticle,
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive',
    tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven',
    withPicture?: boolean,
  ) => {
    const dupInfo = duplicateMap?.get(article.id);
    if (dupInfo && !dupInfo.isDuplicateLeader) {
      const ok = window.confirm(
        `Another source already reported this story:\n\n• ${dupInfo.similarTitles[0] ?? ''}\n\nContinue and publish this version too?`
      );
      if (!ok) return false;
    }
    onApprove(article, slideType, tone, writingStyle, withPicture ?? illustrationOverrides[article.id] ?? true);
    return true;
  };

  const renderArticleCard = (article: MultiTenantArticle) => {
    const slideType = slideTypeFor(article);
    const toneOverride = toneOverrides[article.id] || defaultTone;
    const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    const isAnimating = animatingArticles.has(article.id);
    const dupInfo = duplicateMap?.get(article.id);
    const happened = article.published_at || article.created_at;
    const holdTag = holdReasonTag({ heldReason: article.held_reason, qualityScore: article.content_quality_score, autopilotBar });

    return (
      <motion.div
        key={article.id}
        layout={prefersReducedMotion ? false : "position"}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: isAnimating ? 0.55 : 1, y: 0 }}
        exit={prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, x: 24, height: 0, marginTop: 0, marginBottom: 0, scale: 0.98 }}
        transition={{
          layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.7 },
          duration: 0.22,
          ease: [0.4, 0, 0.2, 1]
        }}
        style={{ overflow: "hidden", willChange: "transform, opacity" }}
      >
        <DeskCard
          className={dupInfo && !dupInfo.isDuplicateLeader ? "ml-4 border-l-4 border-l-muted-foreground/40" : undefined}
          title={article.title}
          thumbnailUrl={article.image_url}
          onOpen={() => setOpenArticleId(article.id)}
          keepActions={isProcessing}
          badges={holdTag ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span onClick={(e) => e.stopPropagation()}><DeskBadge>{holdTag.label}</DeskBadge></span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{holdTag.detail}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : undefined}
          leading={selectMode ? (
            <Checkbox
              checked={selectedArticles.has(article.id)}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={(checked) => {
                const next = new Set(selectedArticles);
                if (checked) next.add(article.id);
                else next.delete(article.id);
                setSelectedArticles(next);
              }}
              className="mt-1"
              aria-label={`Select “${article.title}”`}
            />
          ) : undefined}
          meta={
            <MetaLine parts={[
              getSourceDomain(article.url),
              happened ? formatDistanceToNow(new Date(happened), { addSuffix: true }) : null,
              dupInfo ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        {dupInfo.isDuplicateLeader ? `${dupInfo.similarCount} similar` : "Similar"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="mb-1 font-semibold">{dupInfo.isDuplicateLeader ? "Similar articles:" : "Similar to:"}</p>
                      {dupInfo.similarTitles.map((t, i) => <p key={i} className="truncate text-sm">• {t}</p>)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null,
            ]} />
          }
          footer={dupInfo && dupInfo.isDuplicateLeader && dupInfo.similarCount > 0 && !showAllDuplicates ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); toggleDuplicateGroup(dupInfo.duplicateGroupId); }}
              className="-ml-2 mt-1 h-8 px-2 text-sm text-muted-foreground"
              aria-expanded={expandedDuplicateGroups.has(dupInfo.duplicateGroupId)}
            >
              {expandedDuplicateGroups.has(dupInfo.duplicateGroupId)
                ? "Hide similar reports"
                : `${dupInfo.similarCount} similar from other source${dupInfo.similarCount > 1 ? "s" : ""}`}
            </Button>
          ) : undefined}
          actions={
            <>
              <SpikeButton onClick={() => onDelete(article.id, article.title)} disabled={isDeleting} />
              <PublishSplitButton
                busy={isProcessing}
                disabled={isDeleting}
                onPublish={() => publishArticle(article, slideType, toneOverride, writingStyleOverride)}
                onPublishWithoutPicture={() => publishArticle(article, slideType, toneOverride, writingStyleOverride, false)}
              />
            </>
          }
        />
      </motion.div>
    );
  };

  // Bulk delete done, or nothing waiting: one short line and one action
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-base text-muted-foreground">
          {bulkDeleteCount !== null ? `${bulkDeleteCount} deleted` : "Nothing waiting"}
        </p>
        <Button onClick={onRefresh} variant="outline" size="sm">Refresh</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Awaiting review = gathered articles not written yet, waiting on the owner; the tools menu sits on its label */}
      <ShelfLabel
        id="desk-incoming"
        tool={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Awaiting review tools">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { if (selectMode) setSelectedArticles(new Set()); setSelectMode(!selectMode); }}>
                {selectMode ? "Stop selecting" : "Select several"}
              </DropdownMenuItem>
              {duplicateMap && duplicateMap.size > 0 && (
                <DropdownMenuCheckboxItem checked={showAllDuplicates} onCheckedChange={(v) => setShowAllDuplicates(v === true)}>
                  Show duplicates
                </DropdownMenuCheckboxItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        Awaiting review · {totalArticlesCount ?? articles.length}
      </ShelfLabel>

      {/* Bulk action toolbar - only in select mode */}
      {selectMode && (
        <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg border border-border/60 bg-muted/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedArticles.size} selected
            </span>
            <Button size="sm" variant="ghost" onClick={handleSelectAll} className="h-8 text-sm px-2">
              All ({articles.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDeselectAll} className="h-8 text-sm px-2">
              None
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={bulkDeleteRelevanceThreshold.toString()} onValueChange={(value) => setBulkDeleteRelevanceThreshold(Number(value))}>
              <SelectTrigger className="w-16 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="25">25%</SelectItem>
                <SelectItem value="50">50%</SelectItem>
                <SelectItem value="75">75%</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="destructive" onClick={handleBulkDeleteByRelevance} className="h-9 text-sm">
              Delete below ({articles.filter(a => a.regional_relevance_score < bulkDeleteRelevanceThreshold).length})
            </Button>
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={selectedArticles.size === 0}
              className="h-9 text-sm"
            >
              Delete selected ({selectedArticles.size})
            </Button>
          </div>
        </div>
      )}
      
      <AnimatePresence initial={false} mode="popLayout">
        {visibleArticles.map(renderArticleCard)}
      </AnimatePresence>
      
      {/* Load more button */}
      {hasMoreArticles && onLoadMore && (
        <div className="pt-2">
          <Button 
            onClick={onLoadMore} 
            variant="outline" 
            className="w-full gap-2"
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>Loading</>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Load more {totalArticlesCount !== null && articles.length < totalArticlesCount 
                  ? `(${totalArticlesCount - articles.length} left)` 
                  : ''}
              </>
            )}
          </Button>
        </div>
      )}
      {(() => {
        const a = openArticleId ? articles.find((x) => x.id === openArticleId) ?? null : null;
        return (
          <WaitingStoryDrawer
            article={a}
            open={!!a}
            onOpenChange={(o) => !o && setOpenArticleId(null)}
            {...opt("dupInfo", a ? duplicateMap?.get(a.id) : undefined)}
            slideType={a ? slideTypeFor(a) : defaultSlideQuantity}
            tone={(a && toneOverrides[a.id]) || defaultTone}
            writingStyle={(a && writingStyleOverrides[a.id]) || defaultWritingStyle}
            onSlideType={(v) => a && onSlideQuantityChange(a.id, v)}
            onTone={(v) => a && onToneOverrideChange(a.id, v)}
            onWritingStyle={(v) => a && onWritingStyleOverrideChange(a.id, v)}
            makePicture={a ? illustrationOverrides[a.id] ?? true : true}
            onMakePicture={(on) => a && setIllustrationOverrides((prev) => ({ ...prev, [a.id]: on }))}
            {...opt("highlightTerms", highlightTerms)}
            isProcessing={a ? processingArticle === a.id : false}
            isDeleting={a ? deletingArticles.has(a.id) : false}
            onPublish={() => {
              if (!a) return;
              if (publishArticle(a, slideTypeFor(a), toneOverrides[a.id] || defaultTone, writingStyleOverrides[a.id] || defaultWritingStyle)) setOpenArticleId(null);
            }}
            onSkip={() => { if (a) { onDelete(a.id, a.title); setOpenArticleId(null); } }}
            {...opt("onSuppress", onDiscardAndSuppress && topicId && a ? () => { onDiscardAndSuppress(a.id, topicId, a.url, a.title); setOpenArticleId(null); } : undefined)}
          />
        );
      })()}
    </div>
  );
}
