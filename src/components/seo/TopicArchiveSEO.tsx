import { Helmet } from 'react-helmet-async';

interface TopicArchiveSEOProps {
  topicName: string;
  topicDescription: string;
  topicSlug: string;
  totalStories: number;
  currentPage: number;
  totalPages: number;
}

export const TopicArchiveSEO = ({
  topicName,
  topicDescription,
  topicSlug,
  totalStories,
  currentPage,
  totalPages
}: TopicArchiveSEOProps) => {
  const baseUrl = window.location.origin;
  const archiveUrl = `${baseUrl}/feed/${topicSlug}/archive`;
  const currentUrl = currentPage > 1 
    ? `${archiveUrl}?page=${currentPage}` 
    : archiveUrl;

  const title = currentPage > 1
    ? `${topicName} Archive - Page ${currentPage} of ${totalPages}`
    : `${topicName} Archive - All Stories`;

  const description = `Browse all ${totalStories.toLocaleString()} stories from ${topicName}. ${topicDescription}`;

  // CollectionPage structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "description": description,
    "url": currentUrl,
    "inLanguage": "en",
    "isPartOf": {
      "@type": "WebSite",
      "name": "Breefly",
      "url": baseUrl
    },
    "about": {
      "@type": "Thing",
      "name": topicName,
      "description": topicDescription
    },
    "numberOfItems": totalStories
  };

  const prevUrl = currentPage > 1 
    ? (currentPage === 2 ? archiveUrl : `${archiveUrl}?page=${currentPage - 1}`)
    : null;

  const nextUrl = currentPage < totalPages 
    ? `${archiveUrl}?page=${currentPage + 1}`
    : null;

  return (
    <Helmet>
      {/* Title & Description */}
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Canonical URL */}
      <link rel="canonical" href={currentUrl} />

      {/* Pagination */}
      {prevUrl && <link rel="prev" href={prevUrl} />}
      {nextUrl && <link rel="next" href={nextUrl} />}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:site_name" content="Breefly" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />

      {/* Robots */}
      <meta name="robots" content="index, follow" />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
};
