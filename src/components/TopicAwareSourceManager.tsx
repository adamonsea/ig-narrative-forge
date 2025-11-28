import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { DiscardedArticlesViewer } from "./DiscardedArticlesViewer";
import { UnifiedSourceManager } from "./UnifiedSourceManager";

interface TopicAwareSourceManagerProps {
  selectedTopicId?: string;
  onSourcesChange: () => void;
  topicName?: string;
  description?: string;
  keywords?: string[];
  topicType?: 'regional' | 'keyword';
  region?: string;
}

export const TopicAwareSourceManager = ({ 
  selectedTopicId, 
  onSourcesChange,
  topicName,
  description,
  keywords,
  topicType,
  region
}: TopicAwareSourceManagerProps) => {
  const [showDiscardedViewer, setShowDiscardedViewer] = useState(false);

  if (selectedTopicId) {
    return (
      <div className="space-y-6">
        <UnifiedSourceManager
          mode="topic"
          topicId={selectedTopicId}
          onSourcesChange={onSourcesChange}
          topicName={topicName}
          description={description}
          keywords={keywords}
          topicType={topicType}
          region={region}
        />
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDiscardedViewer(true)}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Discarded Articles
          </Button>
        </div>

        {showDiscardedViewer && (
          <DiscardedArticlesViewer
            isOpen={showDiscardedViewer}
            topicId={selectedTopicId}
            onClose={() => setShowDiscardedViewer(false)}
          />
        )}
      </div>
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
