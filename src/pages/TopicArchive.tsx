import { useParams, Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { TopicArchiveSEO } from "@/components/seo/TopicArchiveSEO";
import { StoryCard } from "@/components/StoryCard";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface Story {
  id: string;
  title: string;
  author: string | null;
  cover_illustration_url: string | null;
  created_at: string;
  article: {
    source_url: string;
    published_at?: string;
  };
}

interface Topic {
  id: string;
  name: string;
  slug: string;
  description: string;
  topic_type: string;
  branding_config?: {
    logo_url?: string;
    subheader?: string;
  };
}

const STORIES_PER_PAGE = 24;

const TopicArchive = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const [topic, setTopic] = useState<Topic | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(totalCount / STORIES_PER_PAGE);

  useEffect(() => {
    const loadArchive = async () => {
      if (!slug) return;
      
      setLoading(true);
      
      try {
        // Load topic - use type assertion to avoid infinite type recursion
        const topicResult = await (supabase as any)
          .from('topics')
          .select('id, name, slug, description, topic_type, branding_config')
          .eq('slug', slug.toLowerCase())
          .eq('is_public', true)
          .eq('is_active', true)
          .maybeSingle();

        if (topicResult.error || !topicResult.data) {
          console.error('Topic error:', topicResult.error);
          setTopic(null);
          setLoading(false);
          return;
        }

        const topicData = topicResult.data;
        const brandingConfig = topicData.branding_config as any;
        setTopic({
          id: topicData.id,
          name: topicData.name,
          slug: topicData.slug,
          description: topicData.description,
          topic_type: topicData.topic_type,
          branding_config: brandingConfig ? {
            logo_url: brandingConfig.logo_url,
            subheader: brandingConfig.subheader
          } : undefined
        });

        // Get all topic_article IDs for this topic
        const topicArticlesIdsResult = await supabase
          .from('topic_articles')
          .select('id')
          .eq('topic_id', topicData.id)
          .order('created_at', { ascending: false });

        if (topicArticlesIdsResult.error || !topicArticlesIdsResult.data?.length) {
          console.error('Topic articles error:', topicArticlesIdsResult.error);
          setTotalCount(0);
          setStories([]);
          setLoading(false);
          return;
        }

        const topicArticleIds = topicArticlesIdsResult.data.map(ta => ta.id);

        // Count all published stories for this topic
        const storiesCountResult = await supabase
          .from('stories')
          .select('id', { count: 'exact', head: true })
          .in('topic_article_id', topicArticleIds)
          .eq('is_published', true)
          .in('status', ['ready', 'published']);

        setTotalCount(storiesCountResult.count || 0);

        // Load paginated stories with .range()
        const offset = (page - 1) * STORIES_PER_PAGE;
        const storiesResult = await supabase
          .from('stories')
          .select('id, title, author, cover_illustration_url, created_at, topic_article_id')
          .in('topic_article_id', topicArticleIds)
          .eq('is_published', true)
          .in('status', ['ready', 'published'])
          .order('created_at', { ascending: false })
          .range(offset, offset + STORIES_PER_PAGE - 1);

        if (storiesResult.error) {
          console.error('Stories error:', storiesResult.error);
          setStories([]);
        } else if (!storiesResult.data?.length) {
          setStories([]);
        } else {
          // Batch fetch article data for all stories
          const topicArticleIdsInPage = storiesResult.data.map(s => s.topic_article_id);
          const articlesResult = await supabase
            .from('topic_articles')
            .select('id, articles(source_url, published_at)')
            .in('id', topicArticleIdsInPage);

          const articlesMap = new Map();
          if (articlesResult.data) {
            articlesResult.data.forEach(ta => {
              const articles = (ta as any).articles;
              const article = Array.isArray(articles) ? articles[0] : articles;
              articlesMap.set(ta.id, article || { source_url: '', published_at: '' });
            });
          }

          setStories(storiesResult.data.map((story) => ({
            id: story.id,
            title: story.title,
            author: story.author,
            cover_illustration_url: story.cover_illustration_url,
            created_at: story.created_at,
            article: articlesMap.get(story.topic_article_id) || { source_url: '', published_at: '' }
          })));
        }
      } catch (error) {
        console.error('Error loading archive:', error);
      } finally {
        setLoading(false);
      }
    };

    loadArchive();
  }, [slug, page]);

  const handlePageChange = (newPage: number) => {
    setSearchParams({ page: newPage.toString() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="w-32 h-10 mb-8" />
          <Skeleton className="w-64 h-12 mb-4" />
          <Skeleton className="w-96 h-6 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="w-full h-80 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Archive Not Found</h1>
            <p className="text-muted-foreground">
              The topic you're looking for doesn't exist or is not publicly available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta Tags & Structured Data */}
      <TopicArchiveSEO
        topicName={topic.name}
        topicDescription={topic.branding_config?.subheader || topic.description}
        topicSlug={slug || ''}
        totalStories={totalCount}
        currentPage={page}
        totalPages={totalPages}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button variant="outline" asChild className="mb-8">
          <Link to={`/feed/${slug}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to {topic.name}
          </Link>
        </Button>

        {/* Archive Header - More compact */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Archive className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">
              Archive
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {totalCount.toLocaleString()} {totalCount === 1 ? 'story' : 'stories'}
          </p>
        </header>

        {/* Stories Grid */}
        {stories.length === 0 ? (
          <div className="text-center py-16">
            <Archive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No Stories Yet</h2>
            <p className="text-muted-foreground">
              Check back soon for new stories in {topic.name}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
              {stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  topicSlug={slug || ''}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    {page > 1 ? (
                      <PaginationPrevious
                        onClick={() => handlePageChange(page - 1)}
                        className="cursor-pointer"
                      />
                    ) : (
                      <PaginationPrevious className="pointer-events-none opacity-50" />
                    )}
                  </PaginationItem>

                  {/* First page */}
                  <PaginationItem>
                    <PaginationLink
                      onClick={() => handlePageChange(1)}
                      isActive={page === 1}
                      className="cursor-pointer"
                    >
                      1
                    </PaginationLink>
                  </PaginationItem>

                  {/* Ellipsis before current page range */}
                  {page > 3 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  {/* Current page range */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p > 1 && p < totalPages && Math.abs(p - page) <= 1)
                    .map(p => (
                      <PaginationItem key={p}>
                        <PaginationLink
                          onClick={() => handlePageChange(p)}
                          isActive={page === p}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                  {/* Ellipsis after current page range */}
                  {page < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  {/* Last page */}
                  {totalPages > 1 && (
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => handlePageChange(totalPages)}
                        isActive={page === totalPages}
                        className="cursor-pointer"
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  )}

                  <PaginationItem>
                    {page < totalPages ? (
                      <PaginationNext
                        onClick={() => handlePageChange(page + 1)}
                        className="cursor-pointer"
                      />
                    ) : (
                      <PaginationNext className="pointer-events-none opacity-50" />
                    )}
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TopicArchive;
