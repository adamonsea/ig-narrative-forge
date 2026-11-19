import { UnifiedSourceManager } from "./UnifiedSourceManager";

interface TopicAwareSourceManagerProps {
  selectedTopicId?: string | undefined;
  onSourcesChange: () => void;
  topicName?: string | undefined;
  description?: string | undefined;
  keywords?: string[] | undefined;
  topicType?: 'regional' | 'keyword' | undefined;
  region?: string | undefined;
  articleCount?: number | undefined;
}

export const TopicAwareSourceManager = ({ 
  selectedTopicId, 
  onSourcesChange,
  topicName,
  description,
  keywords,
  topicType,
  region,
  articleCount = 0
}: TopicAwareSourceManagerProps) => {
  if (selectedTopicId) {
    return (
      <UnifiedSourceManager
        mode="topic"
        topicId={selectedTopicId}
        onSourcesChange={onSourcesChange}
        topicName={topicName}
        description={description}
        keywords={keywords}
        topicType={topicType}
        region={region}
        articleCount={articleCount}
      />
    );
  }

  // Global fallback
  return (
    <div className="space-y-6">
      <UnifiedSourceManager
        mode="global"
        onSourcesChange={onSourcesChange}
        title="Legacy Source Manager"
        description="Please use the topic-specific source management instead"
      />
    </div>
  );
};
