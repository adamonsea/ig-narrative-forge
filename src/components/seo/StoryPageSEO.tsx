import { Helmet } from 'react-helmet-async';

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  cover_illustration_url: string | null;
  created_at: string;
  slides?: Array<{
    id: string;
    slide_number: number;
    content: string;
  }>;
  article?: {
    published_at?: string;
  };
}

interface StoryPageSEOProps {
  story: Story;
  topicName: string;
  topicSlug: string;
  topicType?: string;
}

export const StoryPageSEO = ({
  story,
  topicName,
  topicSlug,
  topicType
}: StoryPageSEOProps) => {
  const storyUrl = `https://curatr.pro/feed/${topicSlug}/story/${story.id}`;
  const feedUrl = `https://curatr.pro/feed/${topicSlug}`;
  
  // Title: Story title + Curated TopicName
  const title = `${story.title} | Curated ${topicName}`;
  
  // Description: First 160 chars of first slide or fallback
  const getDescription = () => {
    if (story.slides && story.slides.length > 0) {
      const firstSlideContent = story.slides[0].content;
      // Strip HTML and trim to 160 chars
      const plainText = firstSlideContent.replace(/<[^>]*>/g, '').trim();
      return plainText.length > 160 
        ? plainText.substring(0, 157) + '...'
        : plainText;
    }
    return `Read ${story.title} on Curated ${topicName}`;
  };
  
  const description = getDescription();
  const imageUrl = story.cover_illustration_url || 'https://curatr.pro/placeholder.svg';
  const siteName = `Curated ${topicName}`;
  
  // Published date
  const publishedTime = story.article?.published_at || story.created_at;
  
  // Article structured data
  const articleData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": storyUrl,
    "headline": story.title,
    "url": storyUrl,
    "datePublished": publishedTime,
    "dateModified": story.created_at,
    "author": {
      "@type": story.publication_name ? "Organization" : "Person",
      "name": story.author || story.publication_name || topicName
    },
    "publisher": {
      "@type": "Organization",
      "name": siteName,
      "logo": {
        "@type": "ImageObject",
        "url": "https://curatr.pro/placeholder.svg"
      }
    },
    ...(story.cover_illustration_url && {
      "image": {
        "@type": "ImageObject",
        "url": story.cover_illustration_url
      }
    }),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": storyUrl
    }
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <link rel="canonical" href={storyUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="article" />
      <meta property="og:url" content={storyUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content={siteName} />
      <meta property="article:published_time" content={publishedTime} />
      {story.author && <meta property="article:author" content={story.author} />}
      {topicType && <meta property="article:section" content={topicType} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={storyUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Link back to feed */}
      <meta property="og:see_also" content={feedUrl} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(articleData)}
      </script>
    </Helmet>
  );
};
