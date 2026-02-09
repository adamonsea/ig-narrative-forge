import { UnifiedSourceManager } from "./UnifiedSourceManager";

interface TopicAwareSourceManagerProps {
  selectedTopicId?: string;
  onSourcesChange: () => void;
  topicName?: string;
  description?: string;
  keywords?: string[];
  topicType?: 'regional' | 'keyword';
  region?: string;
  articleCount?: number;
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
