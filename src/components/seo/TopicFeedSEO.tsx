import { Helmet } from 'react-helmet-async';

interface TopicFeedSEOProps {
  topicName: string;
  topicDescription?: string;
  topicSlug: string;
  topicType?: string;
  region?: string;
  logoUrl?: string;
}

export const TopicFeedSEO = ({
  topicName,
  topicDescription,
  topicSlug,
  topicType,
  region,
  logoUrl
}: TopicFeedSEOProps) => {
  const feedUrl = `https://breef.pro/feed/${topicSlug}`;
  const defaultDescription = `Stay updated with ${topicName}. Curated stories, insights, and analysis delivered in an engaging feed format.`;
  const description = topicDescription || defaultDescription;
  const title = `${topicName} | Breefly`;
  const imageUrl = logoUrl || 'https://breef.pro/placeholder.svg';

  // Generate structured data for the feed
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": topicName,
    "description": description,
    "url": feedUrl,
    "itemListElement": []
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <link rel="canonical" href={feedUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={feedUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="Breefly" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={feedUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Additional SEO Tags */}
      {region && <meta name="geo.placename" content={region} />}
      {topicType && <meta name="article:section" content={topicType} />}

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
};
