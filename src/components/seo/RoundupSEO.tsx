import { Helmet } from 'react-helmet-async';
import { format, parseISO } from 'date-fns';
import { BRAND } from '@/lib/constants/branding';

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
  
  // Extract story headlines from slide data for richer description
  const storySlides = roundup.slide_data
    ?.filter((slide: any) => slide.type === 'story_preview' && slide.headline)
    .slice(0, 3) || [];
  
  const headlinesSummary = storySlides.length > 0
    ? ` Headlines include: ${storySlides.map((s: any) => s.headline).join(' • ')}`
    : '';
  
  // Extract keywords/categories if available
  const keywords = roundup.stats?.top_keywords || [];
  const locations = roundup.stats?.locations || [];
  
  // Create title and description based on briefing type
  const title = isWeekly
    ? `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')} ${topicName} Weekly Briefing`
    : `${format(startDate, 'MMMM d, yyyy')} ${topicName} Daily Briefing`;
  
  const description = isWeekly
    ? `Catch up on ${storyCount} stories from ${topicName} this week (${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}).${headlinesSummary} Your comprehensive weekly news digest.`
    : `Today's ${topicName} news digest featuring ${storyCount} stories from ${format(startDate, 'MMMM d, yyyy')}.${headlinesSummary} Stay informed with our daily briefing.`;
  
  const url = isWeekly
    ? `${window.location.origin}/feed/${topicSlug}/weekly/${format(startDate, 'yyyy-MM-dd')}`
    : `${window.location.origin}/feed/${topicSlug}/daily/${format(startDate, 'yyyy-MM-dd')}`;
  
  // Estimated reading time (2 minutes per story)
  const estimatedReadingTime = Math.max(storyCount * 2, 5);
  
  // Structured data for the briefing
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    "name": title,
    "description": description,
    "url": url,
    "inLanguage": "en-GB",
    "datePublished": roundup.period_start,
    "dateModified": roundup.period_start,
    "timeRequired": `PT${estimatedReadingTime}M`,
    "keywords": [...keywords, ...locations, topicName, isWeekly ? 'weekly briefing' : 'daily briefing', 'news digest'].join(', '),
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": storyCount,
      "itemListElement": roundup.slide_data
        ?.filter((slide: any) => slide.type === 'story_preview' && slide.story_id)
        .slice(0, 10) // Limit to first 10 for structured data
        .map((slide: any, index: number) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": slide.headline || 'News Story',
          "description": slide.summary || '',
          "url": `${window.location.origin}/feed/${topicSlug}/story/${slide.story_id}`,
          "image": slide.image_url || undefined
        })) || []
    },
    "publisher": {
      "@type": "Organization",
      "name": BRAND.organizationName,
      "logo": {
        "@type": "ImageObject",
        "url": BRAND.logoUrl
      }
    },
    "about": {
      "@type": "Thing",
      "name": topicName,
      "description": `News and updates about ${topicName}`
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
          "name": isWeekly ? "Weekly Briefing" : "Daily Briefing",
          "item": url
        }
      ]
    }
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={[...keywords, ...locations, topicName].join(', ')} />
      
      {/* Robots meta tag for AI search */}
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
      
      {/* Open Graph */}
      <meta property="og:type" content="article" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={BRAND.siteName} />
      <meta property="og:locale" content="en_GB" />
      <meta property="article:published_time" content={roundup.period_start} />
      <meta property="article:section" content={topicName} />
      {keywords.map((keyword, i) => (
        <meta key={i} property="article:tag" content={keyword} />
      ))}
      
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
