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
    source_url?: string;
    published_at?: string;
  };
}

interface StoryPageSEOProps {
  story: Story;
  topicName: string;
  topicSlug: string;
  topicType?: string;
  topicLogoUrl?: string;
  canonicalStoryId?: string; // For duplicate content - point to original
  canonicalTopicSlug?: string;
}

export const StoryPageSEO = ({
  story,
  topicName,
  topicSlug,
  topicType,
  topicLogoUrl,
  canonicalStoryId,
  canonicalTopicSlug
}: StoryPageSEOProps) => {
  // Use canonical URL for the original story if this is a duplicate
  const canonicalSlug = canonicalTopicSlug || topicSlug;
  const canonicalId = canonicalStoryId || story.id;
  const storyUrl = `https://curatr.pro/feed/${topicSlug}/story/${story.id}`;
  const canonicalUrl = `https://curatr.pro/feed/${canonicalSlug}/story/${canonicalId}`;
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
  
  // Generate full article body from all slides for structured data
  const getArticleBody = () => {
    if (!story.slides || story.slides.length === 0) return story.title;
    return story.slides
      .sort((a, b) => a.slide_number - b.slide_number)
      .map(slide => slide.content.replace(/<[^>]*>/g, '').trim())
      .join('\n\n');
  };
  
  const articleBody = getArticleBody();
  
  // Prioritize cover illustration for visual appeal, fallback to branded OG image with topic logo
  const imageUrl = story.cover_illustration_url || 
    `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/generate-og-image?title=${encodeURIComponent(story.title)}&subtitle=${encodeURIComponent(topicName)}&topic_name=${encodeURIComponent(topicName)}${topicLogoUrl ? `&logo_url=${encodeURIComponent(topicLogoUrl)}` : ''}&v=${Date.now()}`;
  
  const siteName = topicName;
  
  // Published date
  const publishedTime = story.article?.published_at || story.created_at;
  
  // Article structured data with full content
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
        "url": topicLogoUrl || "https://curatr.pro/placeholder.svg"
      }
    },
    "articleBody": articleBody,
    "wordCount": articleBody.split(/\s+/).length,
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
      <link rel="canonical" href={canonicalUrl} />

      {/* AI Search Engine & Robots Directives */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="article" />
      <meta property="og:url" content={storyUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={`${topicName} - ${story.title}`} />
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
      
      {/* Hidden HTML content for non-JS crawlers */}
      <noscript>
        {`
          <article itemScope itemType="https://schema.org/Article">
            <h1 itemProp="headline">${story.title}</h1>
            <meta itemProp="author" content="${story.author || story.publication_name || topicName}" />
            <meta itemProp="datePublished" content="${publishedTime}" />
            ${story.cover_illustration_url ? `<img itemProp="image" src="${story.cover_illustration_url}" alt="${story.title}" />` : ''}
            <div itemProp="articleBody">
              ${story.slides?.sort((a, b) => a.slide_number - b.slide_number)
                .map(slide => `<section>${slide.content}</section>`)
                .join('\n') || ''}
            </div>
            ${story.article?.source_url ? `<a itemProp="url" href="${story.article.source_url}">Original Source</a>` : ''}
          </article>
        `}
      </noscript>
    </Helmet>
  );
};
