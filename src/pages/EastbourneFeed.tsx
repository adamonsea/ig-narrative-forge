import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  updated_at: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
  }>;
  article: {
    source_url: string;
    region: string;
    published_at?: string;
  };
}

type SortOption = "newest" | "oldest";

export default function EastbourneFeed() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  useEffect(() => {
    loadStories();
  }, [sortBy]);

  const loadStories = async () => {
    try {
      setLoadingStories(true);

      // 1) Try to resolve the Eastbourne topic (by slug or region)
      const { data: topicData } = await supabase
        .from("topics")
        .select("id, name, slug, region, is_public, is_active")
        .or("slug.eq.eastbourne,region.ilike.%eastbourne%")
        .eq("is_active", true)
        .limit(1)
        .single();

      // 2) Legacy stories linked via articles (region on articles)
      const { data: legacyData, error: legacyError } = await supabase
        .from("stories")
        .select(`
          id,
          title,
          author,
          publication_name,
          created_at,
          updated_at,
          status,
          is_published,
          slides (
            id,
            slide_number,
            content
          ),
          articles (
            source_url,
            region,
            published_at
          )
        `)
        .eq("status", "published")
        .ilike("articles.region", "%eastbourne%");

      if (legacyError) {
        console.error("Error loading legacy stories:", legacyError);
      }

      const legacyTransformed = (legacyData || []).map((story: any) => ({
        id: story.id,
        title: story.title,
        author: story.author,
        publication_name: story.publication_name,
        created_at: story.created_at,
        updated_at: story.updated_at,
        slides: (story.slides || []).sort((a: any, b: any) => a.slide_number - b.slide_number),
        article: {
          source_url: story.articles?.source_url,
          region: story.articles?.region,
          published_at: story.articles?.published_at,
        },
      }));

      // 3) Multi-tenant stories linked via topic_articles (region lives on topic)
      let multiTenantTransformed: any[] = [];
      if (topicData?.id) {
        const { data: mtData, error: mtError } = await supabase
          .from("stories")
          .select(`
            id,
            title,
            author,
            publication_name,
            created_at,
            updated_at,
            status,
            is_published,
            slides (
              id,
              slide_number,
              content
            ),
            topic_articles (
              id,
              topic_id,
              shared_article_content:shared_article_content (
                url,
                title,
                author,
                published_at,
                source_domain
              )
            )
          `)
          .eq("status", "published")
          .eq("topic_articles.topic_id", topicData.id);

        if (mtError) {
          console.error("Error loading multi-tenant stories:", mtError);
        }

        multiTenantTransformed = (mtData || []).map((story: any) => {
          const sac = story.topic_articles?.shared_article_content;
          return {
            id: story.id,
            title: story.title,
            author: story.author,
            publication_name: story.publication_name,
            created_at: story.created_at,
            updated_at: story.updated_at,
            slides: (story.slides || []).sort((a: any, b: any) => a.slide_number - b.slide_number),
            article: {
              source_url: sac?.url,
              region: topicData?.region || "eastbourne",
              published_at: sac?.published_at,
            },
          };
        });
      }

      // 4) Filter out stories without articles (due to RLS)
      const validLegacy = legacyTransformed.filter(story => story.article?.source_url);
      const validMultiTenant = multiTenantTransformed.filter(story => story.article?.source_url);

      // 5) Merge, de-dupe by story id, then sort
      const mergedMap = new Map<string, any>();
      [...validLegacy, ...validMultiTenant].forEach((s) => mergedMap.set(s.id, s));
      let merged = Array.from(mergedMap.values());

      // 6) Fallback if no stories found
      if (merged.length === 0) {
        console.log('No stories found, trying fallback query...');
        const { data: fallbackStories } = await supabase
          .from('stories')
          .select(`
            id,
            title,
            author,
            publication_name,
            created_at,
            updated_at,
            slides (*)
          `)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(10);
          
        if (fallbackStories?.length) {
          merged = fallbackStories.map(story => ({
            ...story,
            slides: (story.slides || []).sort((a: any, b: any) => a.slide_number - b.slide_number),
            article: {
              source_url: '#',
              region: 'Unknown',
              published_at: story.created_at
            }
          }));
        }
      }

      if (sortBy === "newest") {
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      setStories(merged);
    } catch (error) {
      console.error("Error loading slides:", error);
    } finally {
      setLoadingStories(false);
    }
  };

  if (loadingStories) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Eastbourne stories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <h1 className="text-2xl font-bold text-primary mb-2">Eastbourne</h1>
          <FeedFilters
            sortBy={sortBy}
            setSortBy={setSortBy}
            slideCount={stories.reduce((total, story) => total + story.slides.length, 0)}
          />
        </div>
      </header>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {stories.length > 0 ? (
          <div className="space-y-8">
            {stories.map((story) => (
              <StoryCarousel 
                key={story.id} 
                story={story} 
                topicName="Eastbourne"
                storyUrl={`${window.location.origin}/eastbourne-feed/story/${story.id}`}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No stories found for Eastbourne</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your filters or check back later
            </p>
          </div>
        )}
      </div>
    </div>
  );
}