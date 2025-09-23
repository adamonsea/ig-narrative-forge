import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

      console.log('🔍 Eastbourne: Loading stories with ID-first strategy');

      // 1) Try to resolve the Eastbourne topic (by slug or region)
      const { data: topicData } = await supabase
        .from("topics")
        .select("id, name, slug, region, is_public, is_active")
        .or("slug.eq.eastbourne,region.ilike.%eastbourne%")
        .eq("is_active", true)
        .limit(1)
        .single();

      console.log('📊 Eastbourne: Found topic', topicData);

      // ID-first strategy: Get article IDs first, then stories
      const [legacyArticlesRes, mtArticlesRes] = await Promise.all([
        // Get legacy article IDs for Eastbourne (by region)
        supabase
          .from('articles')
          .select('id')
          .ilike('region', '%eastbourne%'),
        // Get multi-tenant article IDs for Eastbourne topic
        topicData?.id ? supabase
          .from('topic_articles')
          .select('id')
          .eq('topic_id', topicData.id) : Promise.resolve({ data: [] })
      ]);

      const legacyArticleIds = (legacyArticlesRes.data || []).map(a => a.id);
      const mtTopicArticleIds = (mtArticlesRes.data || []).map(a => a.id);

      console.log('📊 Eastbourne: Found article IDs', { 
        legacy: legacyArticleIds.length, 
        multiTenant: mtTopicArticleIds.length 
      });

      // Now get stories using these article IDs, requiring slides
      let legacyData: any[] = [];
      let mtData: any[] = [];

      if (legacyArticleIds.length > 0) {
        const { data, error } = await supabase
          .from("stories")
          .select(`
            id,
            title,
            author,
            publication_name,
            created_at,
            updated_at,
            slides!inner (
              id,
              slide_number,
              content
            ),
            articles!inner (
              source_url,
              region,
              published_at
            )
          `)
          .eq("status", "published")
          .in('article_id', legacyArticleIds);

        if (!error) {
          legacyData = data || [];
        }
        console.log('📈 Eastbourne: Legacy stories with slides:', legacyData.length);
      }

      if (mtTopicArticleIds.length > 0) {
        const { data, error } = await supabase
          .from("stories")
          .select(`
            id,
            title,
            author,
            publication_name,
            created_at,
            updated_at,
            slides!inner (
              id,
              slide_number,
              content
            ),
            topic_articles!inner (
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
          .in('topic_article_id', mtTopicArticleIds);

        if (!error) {
          mtData = data || [];
        }
        console.log('📈 Eastbourne: Multi-tenant stories with slides:', mtData.length);
      }

      // Transform data
      const legacyTransformed = legacyData.map((story: any) => ({
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

      const multiTenantTransformed = mtData.map((story: any) => {
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

      console.log('📊 Eastbourne: Transformed stories', {
        legacy: legacyTransformed.length,
        multiTenant: multiTenantTransformed.length
      });

      // 5) Merge, de-dupe by story id, then sort
      const mergedMap = new Map<string, any>();
      [...legacyTransformed, ...multiTenantTransformed].forEach((s) => mergedMap.set(s.id, s));
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

  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          {/* User Avatar for logged in users */}
          {user && (
            <div className="absolute left-4 top-6">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          
          <div className="flex items-center gap-2 justify-center mb-2">
            <h1 className="text-2xl font-bold text-primary">Eastbourne</h1>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
              beta
            </span>
          </div>
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