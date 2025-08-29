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
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
  }>;
  article: {
    source_url: string;
    region: string;
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
      
      let { data, error } = await supabase
        .from("stories")
        .select(`
          id,
          title,
          author,
          publication_name,
          created_at,
          status,
          slides (
            id,
            slide_number,
            content
          ),
          articles!inner (
            source_url,
            region
          )
        `)
        .eq("status", "ready")
        .eq("is_published", true) // Only show published stories in live feed
        .ilike("articles.region", "%eastbourne%");

      if (error) {
        console.error("Error loading stories:", error);
        return;
      }

      // Transform and sort the data
      const transformedStories = (data || []).map(story => ({
        id: story.id,
        title: story.title,
        author: story.author,
        publication_name: story.publication_name,
        created_at: story.created_at,
        slides: story.slides.sort((a, b) => a.slide_number - b.slide_number),
        article: {
          source_url: story.articles.source_url,
          region: story.articles.region
        }
      }));

      // Apply sorting
      let sortedStories = [...transformedStories];
      if (sortBy === "newest") {
        sortedStories.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        sortedStories.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      setStories(sortedStories);
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
              <StoryCarousel key={story.id} story={story} topicName="Eastbourne" />
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