import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { FeedSlide } from "@/components/FeedSlide";
import { FeedFilters } from "@/components/FeedFilters";

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  story: {
    id: string;
    title: string;
    author: string | null;
    publication_name: string | null;
    created_at: string;
    article: {
      source_url: string;
      region: string;
    };
  };
}

type SortOption = "newest" | "oldest";
type FilterOption = "all" | "with-visuals" | "without-visuals";

export default function EastbourneFeed() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loadingSlides, setLoadingSlides] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    
    if (user) {
      loadSlides();
    }
  }, [user, loading, navigate, sortBy, filterBy]);

  const loadSlides = async () => {
    try {
      setLoadingSlides(true);
      
      let { data, error } = await supabase
        .from("slides")
        .select(`
          id,
          slide_number,
          content,
          stories!inner (
            id,
            title,
            author,
            publication_name,
            created_at,
            status,
            articles!inner (
              source_url,
              region
            )
          )
        `)
        .eq("stories.status", "ready")
        .ilike("stories.articles.region", "%eastbourne%");

      if (error) {
        console.error("Error loading slides:", error);
        return;
      }

      // Transform the data to match our interface
      const transformedSlides = (data || []).map(slide => ({
        id: slide.id,
        slide_number: slide.slide_number,
        content: slide.content,
        story: {
          id: slide.stories.id,
          title: slide.stories.title,
          author: slide.stories.author,
          publication_name: slide.stories.publication_name,
          created_at: slide.stories.created_at,
          article: {
            source_url: slide.stories.articles.source_url,
            region: slide.stories.articles.region
          }
        }
      }));

      // Apply sorting
      let sortedSlides = [...transformedSlides];
      if (sortBy === "newest") {
        sortedSlides.sort((a, b) => new Date(b.story.created_at).getTime() - new Date(a.story.created_at).getTime());
      } else {
        sortedSlides.sort((a, b) => new Date(a.story.created_at).getTime() - new Date(b.story.created_at).getTime());
      }

      // Sort by slide number within each story
      sortedSlides.sort((a, b) => {
        if (a.story.id === b.story.id) {
          return a.slide_number - b.slide_number;
        }
        return 0;
      });

      setSlides(sortedSlides);
    } catch (error) {
      console.error("Error loading slides:", error);
    } finally {
      setLoadingSlides(false);
    }
  };

  if (loading || loadingSlides) {
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
            filterBy={filterBy}
            setFilterBy={setFilterBy}
            slideCount={slides.length}
          />
        </div>
      </header>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {slides.length > 0 ? (
          <div className="space-y-8">
            {slides.map((slide) => (
              <FeedSlide key={slide.id} slide={slide} topicName="Eastbourne" />
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