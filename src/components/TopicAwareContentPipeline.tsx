import React from "react";
import { UnifiedContentPipeline } from "./UnifiedContentPipeline";

interface TopicAwareContentPipelineProps {
  selectedTopicId?: string;
}

export const TopicAwareContentPipeline: React.FC<TopicAwareContentPipelineProps> = ({ selectedTopicId }) => {
  return <UnifiedContentPipeline selectedTopicId={selectedTopicId} />;
};