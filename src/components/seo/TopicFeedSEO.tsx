import { Helmet } from 'react-helmet-async';

interface StoryForSEO {
  id: string;
  title: string;
  created_at?: string;
}

interface TopicFeedSEOProps {
  topicName: string;
  topicDescription?: string;
  topicSlug: string;
  topicType?: string;
  region?: string;
  logoUrl?: string;
  stories?: StoryForSEO[];
}

export const TopicFeedSEO = ({
  topicName,
  topicDescription,
  topicSlug,
  topicType,
  region,
  logoUrl,
  stories = []
}: TopicFeedSEOProps) => {
  const feedUrl = `https://curatr.pro/feed/${topicSlug}`;
  
  // Personalized title: "Curated {TopicName}"
  const title = `Curated ${topicName}`;
  
  // Smart description based on topic type
  const getSmartDescription = () => {
    if (topicDescription) return topicDescription;
    
    if (topicType === 'regional') {
      return `Local news, events, and community updates for ${topicName}. Stay informed about what matters in your area.`;
    }
    
    return `The latest ${topicName} news and insights, curated from trusted sources. Stay ahead of the conversation.`;
  };
  
  const description = getSmartDescription();
  
  // Use dynamic OG image if no custom logo
  const imageUrl = logoUrl || 
    `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/generate-og-image?title=${encodeURIComponent(`Curated ${topicName}`)}&subtitle=${encodeURIComponent(topicName)}`;
  
  const siteName = `Curated ${topicName}`;

  // ItemList structured data for the feed - populated with actual stories
  const itemListData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${feedUrl}#itemlist`,
    "name": topicName,
    "description": description,
    "url": feedUrl,
    "numberOfItems": stories.length,
    "itemListElement": stories.slice(0, 20).map((story, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": story.title,
      "url": `https://curatr.pro/feed/${topicSlug}/story/${story.id}`,
      ...(story.created_at && { "datePublished": story.created_at })
    }))
  };

  // Breadcrumb structured data
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
      }
    ]
  };

  // FAQ Schema for common questions about this topic feed
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `What is the ${topicName} feed?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `The ${topicName} feed is a curated collection of news and updates about ${topicName}${region ? ` in ${region}` : ''}. Stories are sourced from trusted publications and curated for relevance and quality.`
        }
      },
      {
        "@type": "Question",
        "name": `How often is the ${topicName} feed updated?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `The ${topicName} feed is updated multiple times daily as new stories are published by our curated sources. You can also subscribe to notifications for breaking news.`
        }
      },
      {
        "@type": "Question",
        "name": `Can I get ${topicName} news delivered to me?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Yes! You can install the ${topicName} feed as an app on your phone's home screen for easy access. You can also enable push notifications to receive alerts when important stories are published.`
        }
      }
    ]
  };

  // CollectionPage with speakable content
  const collectionPageData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": feedUrl,
    "name": title,
    "description": description,
    "url": feedUrl,
    "inLanguage": "en-GB",
    "isAccessibleForFree": true,
    "isPartOf": {
      "@id": "https://curatr.pro/#website"
    },
    "about": {
      "@type": "Thing",
      "name": topicName,
      ...(region && { 
        "location": {
          "@type": "Place",
          "name": region
        }
      })
    },
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": [
        "h1",
        ".story-headline",
        "[data-speakable='true']"
      ]
    },
    "publisher": {
      "@id": "https://curatr.pro/#organization"
    }
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <link rel="canonical" href={feedUrl} />

      {/* AI Search Engine & Robots Directives */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={feedUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={feedUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* RSS Autodiscovery */}
      <link rel="alternate" type="application/rss+xml" title={`${topicName} RSS Feed`} href={`https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/rss-feed/${topicSlug}`} />

      {/* Additional SEO Tags */}
      {region && <meta name="geo.placename" content={region} />}
      {topicType && <meta name="article:section" content={topicType} />}

      {/* Structured Data - Multiple schemas for rich results */}
      <script type="application/ld+json">
        {JSON.stringify(collectionPageData)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbData)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(faqData)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(itemListData)}
      </script>
    </Helmet>
  );
};
