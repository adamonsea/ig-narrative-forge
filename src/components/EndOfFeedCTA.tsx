import { EndOfFeedFlow } from './EndOfFeedFlow';

interface EndOfFeedCTAProps {
  topicName: string;
  topicId: string;
  topicSlug: string;
  topicIcon?: string | undefined;
}

export const EndOfFeedCTA = ({ topicName, topicId, topicSlug, topicIcon }: EndOfFeedCTAProps) => {
  return (
    <EndOfFeedFlow 
      topicName={topicName}
      topicId={topicId}
      topicSlug={topicSlug}
      topicIcon={topicIcon}
    />
  );
};