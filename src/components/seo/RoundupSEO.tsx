import { Helmet } from 'react-helmet-async';
import { format, parseISO } from 'date-fns';

interface RoundupSEOProps {
  roundup: {
    id: string;
    roundup_type: string;
    period_start: string;
    period_end: string;
    stats: any;
    slide_data: any[];
  };
  topicName: string;
  topicSlug: string;
}

export const RoundupSEO = ({ roundup, topicName, topicSlug }: RoundupSEOProps) => {
  const isWeekly = roundup.roundup_type === 'weekly';
  const storyCount = roundup.stats?.story_count || roundup.slide_data?.length || 0;
  
  // Format dates for display
  const startDate = parseISO(roundup.period_start);
  const endDate = parseISO(roundup.period_end);
  
  // Create title and description based on roundup type
  const title = isWeekly
    ? `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')} ${topicName} Weekly Roundup`
    : `${format(startDate, 'MMMM d, yyyy')} ${topicName} Daily Roundup`;
  
  const description = isWeekly
    ? `Catch up on ${storyCount} stories from ${topicName} this week (${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}). Your comprehensive weekly news digest.`
    : `Today's ${topicName} news digest featuring ${storyCount} stories from ${format(startDate, 'MMMM d, yyyy')}. Stay informed with our daily roundup.`;
  
  const url = isWeekly
    ? `${window.location.origin}/feed/${topicSlug}/weekly/${format(startDate, 'yyyy-MM-dd')}`
    : `${window.location.origin}/feed/${topicSlug}/daily/${format(startDate, 'yyyy-MM-dd')}`;
  
  // Structured data for the roundup
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    "name": title,
    "description": description,
    "url": url,
    "datePublished": roundup.period_start,
    "dateModified": roundup.period_start,
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": storyCount,
      "itemListElement": roundup.slide_data
        ?.filter((slide: any) => slide.type === 'story_preview' && slide.story_id)
        .slice(0, 10) // Limit to first 10 for structured data
        .map((slide: any, index: number) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": `${window.location.origin}/feed/${topicSlug}/story/${slide.story_id}`
        })) || []
    },
    "publisher": {
      "@type": "Organization",
      "name": "Breefly",
      "logo": {
        "@type": "ImageObject",
        "url": "https://curatr.pro/placeholder.svg"
      }
    },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": window.location.origin
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": topicName,
          "item": `${window.location.origin}/feed/${topicSlug}`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": isWeekly ? "Weekly Roundup" : "Daily Roundup",
          "item": url
        }
      ]
    }
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph */}
      <meta property="og:type" content="article" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="Breefly" />
      <meta property="article:published_time" content={roundup.period_start} />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      
      {/* Canonical URL */}
      <link rel="canonical" href={url} />
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
};
