import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { StoryCarousel } from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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
    alt_text: string | null;
    visual_prompt: string | null;
    visuals: Array<{
      image_url: string | null;
      alt_text: string | null;
    }>;
  }>;
  article: {
    source_url: string;
    region: string;
  };
}

type SortOption = "newest" | "oldest";
type FilterOption = "all" | "with-visuals" | "without-visuals";

export default function EastbourneFeed() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    
    if (user) {
      loadStories();
    }
  }, [user, loading, navigate, sortBy, filterBy]);

  const loadStories = async () => {
    try {
      setLoadingStories(true);
      
      let query = supabase
        .from("stories")
        .select(`
          id,
          title,
          author,
          publication_name,
          created_at,
          slides!inner (
            id,
            slide_number,
            content,
            alt_text,
            visual_prompt,
            visuals (
              image_url,
              alt_text
            )
          ),
          article:articles!inner (
            source_url,
            region
          )
        `)
        .eq("status", "ready")
        .ilike("article.region", "%eastbourne%");

      // Apply sorting
      if (sortBy === "newest") {
        query = query.order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: true });
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading stories:", error);
        return;
      }

      let filteredStories = data || [];

      // Apply filtering
      if (filterBy === "with-visuals") {
        filteredStories = filteredStories.filter(story =>
          story.slides.some(slide => slide.visuals && slide.visuals.length > 0)
        );
      } else if (filterBy === "without-visuals") {
        filteredStories = filteredStories.filter(story =>
          !story.slides.some(slide => slide.visuals && slide.visuals.length > 0)
        );
      }

      // Sort slides within each story
      filteredStories.forEach(story => {
        story.slides.sort((a, b) => a.slide_number - b.slide_number);
      });

      setStories(filteredStories);
    } catch (error) {
      console.error("Error loading stories:", error);
    } finally {
      setLoadingStories(false);
    }
  };

  if (loading || loadingStories) {
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-primary">Eastbourne Feed</h1>
              <p className="text-sm text-muted-foreground">Local stories, curated</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Filters */}
        <FeedFilters
          sortBy={sortBy}
          setSortBy={setSortBy}
          filterBy={filterBy}
          setFilterBy={setFilterBy}
          storyCount={stories.length}
        />

        {/* Story Carousel */}
        {stories.length > 0 ? (
          <StoryCarousel stories={stories} />
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