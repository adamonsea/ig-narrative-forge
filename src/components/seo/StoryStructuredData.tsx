import { Helmet } from 'react-helmet-async';

interface Story {
  id: string;
  title: string;
  created_at: string;
  author?: string;
  cover_illustration_url?: string;
  slides?: any[];
}

interface StoryStructuredDataProps {
  story: Story;
  storyUrl: string;
  topicName: string;
  position: number;
}

export const StoryStructuredData = ({
  story,
  storyUrl,
  topicName,
  position
}: StoryStructuredDataProps) => {
  // Generate full article body from all slides
  const getArticleBody = () => {
    if (!story.slides || story.slides.length === 0) return story.title;
    return story.slides
      .sort((a, b) => a.slide_number - b.slide_number)
      .map(slide => {
        // Remove HTML tags and trim
        return slide.content.replace(/<[^>]*>/g, '').trim();
      })
      .join('\n\n');
  };
  
  const articleBody = getArticleBody();
  
  // Generate Article structured data with full content
  const articleData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": storyUrl,
    "headline": story.title,
    "url": storyUrl,
    "datePublished": story.created_at,
    "dateModified": story.created_at,
    "author": {
      "@type": "Organization",
      "name": story.author || topicName
    },
    "publisher": {
      "@type": "Organization",
      "name": "Breefly",
      "logo": {
        "@type": "ImageObject",
        "url": "https://curatr.pro/placeholder.svg"
      }
    },
    "articleBody": articleBody,
    "wordCount": articleBody.split(/\s+/).length,
    "position": position,
    ...(story.cover_illustration_url && {
      "image": {
        "@type": "ImageObject",
        "url": story.cover_illustration_url
      }
    })
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(articleData)}
      </script>
    </Helmet>
  );
};
