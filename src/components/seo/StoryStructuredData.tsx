import { Helmet } from 'react-helmet-async';

interface Story {
  id: string;
  title: string;
  created_at: string;
  author?: string;
  cover_illustration_url?: string;
  slides?: any[];
  article?: {
    region?: string;
    source_url?: string;
  };
  mp_name?: string;
  constituency?: string;
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
  
  // Extract keywords from content
  const extractKeywords = (): string[] => {
    const keywords: string[] = [topicName];
    if (story.article?.region) keywords.push(story.article.region);
    if (story.constituency) keywords.push(story.constituency);
    if (story.mp_name) keywords.push(story.mp_name);
    return keywords;
  };

  // Generate mentions from story content
  const extractMentions = () => {
    const mentions: any[] = [];
    if (story.mp_name) {
      mentions.push({
        "@type": "Person",
        "name": story.mp_name,
        ...(story.constituency && { "workLocation": story.constituency })
      });
    }
    return mentions;
  };

  // Generate Article structured data with full content and enhanced metadata
  const articleData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": storyUrl,
    "headline": story.title,
    "url": storyUrl,
    "datePublished": story.created_at,
    "dateModified": story.created_at,
    "inLanguage": "en-GB",
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
    "articleSection": topicName,
    "wordCount": articleBody.split(/\s+/).length,
    "position": position,
    "keywords": extractKeywords().join(', '),
    "about": {
      "@type": "Thing",
      "name": topicName,
      ...(story.article?.region && { "location": story.article.region })
    },
    ...(extractMentions().length > 0 && { "mentions": extractMentions() }),
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
