import { Helmet } from 'react-helmet-async';

/**
 * Global SEO component that adds WebSite and Organization structured data
 * to every page. This helps AI search engines understand the site structure
 * and enables search functionality in AI responses.
 * 
 * AEO (AI Engine Optimization) features:
 * - Speakable content definitions
 * - Clear entity relationships
 * - AI-friendly content structure
 */
export const GlobalSEO = () => {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://curatr.pro/#website",
    "name": "Curatr",
    "alternateName": ["Curatr Pro", "eeZee News"],
    "url": "https://curatr.pro",
    "description": "AI-powered curated news feeds. Create and manage personalized topic feeds with intelligent content curation from trusted sources.",
    "inLanguage": "en-GB",
    "publisher": {
      "@id": "https://curatr.pro/#organization"
    },
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
    "@id": "https://curatr.pro/#organization",
    "name": "Curatr",
    "alternateName": "Curatr Pro",
    "url": "https://curatr.pro",
    "logo": {
      "@type": "ImageObject",
      "url": "https://curatr.pro/curatr-icon.png",
      "width": "512",
      "height": "512"
    },
    "description": "Multi-tenant editorial platform for curated news feeds with AI-powered content curation and gamified engagement features.",
    "foundingDate": "2024",
    "slogan": "Curated news, your way",
    "knowsAbout": [
      "News curation",
      "Content aggregation", 
      "AI-powered journalism",
      "Local news",
      "Regional news feeds"
    ],
    "serviceType": "News Curation Platform",
    "areaServed": {
      "@type": "Country",
      "name": "United Kingdom"
    }
  };

  // Speakable specification for AI voice assistants
  const speakableSpec = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": [
        "h1",
        ".story-headline",
        ".story-content",
        "[data-speakable='true']"
      ]
    }
  };

  return (
    <Helmet>
      {/* AI Search Engine hints */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow" />
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(speakableSpec)}
      </script>
    </Helmet>
  );
};
