import { Helmet } from 'react-helmet-async';

/**
 * Global SEO component that adds WebSite and Organization structured data
 * to every page. This helps AI search engines understand the site structure
 * and enables search functionality in AI responses.
 */
export const GlobalSEO = () => {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Breefly",
    "alternateName": "eeZee News",
    "url": "https://curatr.pro",
    "description": "Curated news feeds with AI-powered briefings and stories",
    "inLanguage": "en-GB",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://curatr.pro/feed/{slug}"
      },
      "query-input": "required name=slug"
    }
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Breefly",
    "alternateName": "eeZee News",
    "url": "https://curatr.pro",
    "logo": {
      "@type": "ImageObject",
      "url": "https://curatr.pro/placeholder.svg",
      "width": "512",
      "height": "512"
    },
    "description": "Multi-tenant editorial platform for curated news feeds with AI-powered content",
    "foundingDate": "2024",
    "sameAs": []
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
    </Helmet>
  );
};
