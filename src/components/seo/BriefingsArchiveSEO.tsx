import { Helmet } from 'react-helmet-async';

interface BriefingsArchiveSEOProps {
  topicName: string;
  topicSlug: string;
  dailyCount: number;
  weeklyCount: number;
}

export const BriefingsArchiveSEO = ({
  topicName,
  topicSlug,
  dailyCount,
  weeklyCount
}: BriefingsArchiveSEOProps) => {
  const archiveUrl = `https://curatr.pro/feed/${topicSlug}/briefings`;
  
  const title = `${topicName} - News Briefings Archive`;
  const description = `Browse all daily and weekly news briefings for ${topicName}. ${dailyCount} daily briefings and ${weeklyCount} weekly briefings available. Stay up-to-date with comprehensive summaries.`;
  
  const imageUrl = `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/generate-og-image?title=${encodeURIComponent(`${topicName} Briefings`)}&subtitle=${encodeURIComponent('News Archive')}`;

  // Structured data for CollectionPage
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "description": description,
    "url": archiveUrl,
    "breadcrumb": {
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
          "item": `https://curatr.pro/feed/${topicSlug}`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Briefings Archive",
          "item": archiveUrl
        }
      ]
    }
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <link rel="canonical" href={archiveUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={archiveUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={archiveUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
};
