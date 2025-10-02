import { Helmet } from 'react-helmet-async';

interface Story {
  id: string;
  title: string;
  created_at: string;
  author?: string;
  cover_illustration_url?: string;
  slides?: any[];
}

interface StoryStructuredDataProps {
  story: Story;
  storyUrl: string;
  topicName: string;
  position: number;
}

export const StoryStructuredData = ({
  story,
  storyUrl,
  topicName,
  position
}: StoryStructuredDataProps) => {
  // Generate Article structured data
  const articleData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": storyUrl,
    "headline": story.title,
    "url": storyUrl,
    "datePublished": story.created_at,
    "dateModified": story.created_at,
    "author": {
      "@type": "Organization",
      "name": story.author || topicName
    },
    "publisher": {
      "@type": "Organization",
      "name": "breef",
      "logo": {
        "@type": "ImageObject",
        "url": "https://breef.pro/placeholder.svg"
      }
    },
    "position": position,
    ...(story.cover_illustration_url && {
      "image": {
        "@type": "ImageObject",
        "url": story.cover_illustration_url
      }
    })
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(articleData)}
      </script>
    </Helmet>
  );
};
