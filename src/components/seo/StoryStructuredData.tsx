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
    published_at?: string;
  };
  mp_name?: string;
  constituency?: string;
}

interface StoryStructuredDataProps {
  story: Story;
  storyUrl: string;
  topicName: string;
  topicSlug: string;
  position: number;
}

export const StoryStructuredData = ({
  story,
  storyUrl,
  topicName,
  topicSlug,
  position
}: StoryStructuredDataProps) => {
  const feedUrl = `https://curatr.pro/feed/${topicSlug}`;
  
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

  // Breadcrumb data for story page
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://curatr.pro"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": topicName,
        "item": feedUrl
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": story.title,
        "item": storyUrl
      }
    ]
  };

  // Determine if this should be a NewsArticle (for regional/news topics)
  const isNewsArticle = story.article?.region || story.article?.published_at;
  const articleType = isNewsArticle ? "NewsArticle" : "Article";

  // Generate Article structured data with full content and enhanced metadata
  const articleData = {
    "@context": "https://schema.org",
    "@type": articleType,
    "@id": storyUrl,
    "headline": story.title,
    "url": storyUrl,
    "datePublished": story.article?.published_at || story.created_at,
    "dateModified": story.created_at,
    "inLanguage": "en-GB",
    "isAccessibleForFree": true,
    "author": {
      "@type": "Organization",
      "name": story.author || topicName,
      "@id": "https://curatr.pro/#organization"
    },
    "publisher": {
      "@type": ["Organization", "NewsMediaOrganization"],
      "name": "Curatr",
      "@id": "https://curatr.pro/#organization",
      "logo": {
        "@type": "ImageObject",
        "url": "https://curatr.pro/curatr-icon.png"
      },
      "publishingPrinciples": "https://curatr.pro/about"
    },
    "copyrightHolder": {
      "@type": "Organization",
      "name": "Curatr",
      "@id": "https://curatr.pro/#organization"
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": storyUrl
    },
    "isPartOf": {
      "@type": "CollectionPage",
      "@id": feedUrl,
      "name": `Curated ${topicName}`
    },
    "articleBody": articleBody,
    "articleSection": topicName,
    "wordCount": articleBody.split(/\s+/).length,
    "position": position,
    "keywords": extractKeywords().join(', '),
    "about": {
      "@type": "Thing",
      "name": topicName,
      ...(story.article?.region && { 
        "location": {
          "@type": "Place",
          "name": story.article.region
        }
      })
    },
    // Speakable specification for AI voice assistants
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": [
        "h1",
        ".story-headline",
        ".slide-content"
      ]
    },
    ...(isNewsArticle && story.article?.region && {
      "dateline": story.article.region
    }),
    ...(extractMentions().length > 0 && { "mentions": extractMentions() }),
    ...(story.cover_illustration_url && {
      "image": {
        "@type": "ImageObject",
        "url": story.cover_illustration_url,
        "caption": story.title
      },
      "thumbnailUrl": story.cover_illustration_url
    })
  };

  return (
    <Helmet>
      {/* Breadcrumb structured data */}
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbData)}
      </script>
      {/* Article structured data */}
      <script type="application/ld+json">
        {JSON.stringify(articleData)}
      </script>
    </Helmet>
  );
};
