import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface DonationButtonProps {
  onClick: () => void;
  buttonText: string;
  topicId: string;
  visitorId: string;
}

export const DonationButton = ({ onClick, buttonText, topicId, visitorId }: DonationButtonProps) => {
  const handleClick = async () => {
    // Track button click
    try {
      await supabase.from("story_interactions").insert({
        topic_id: topicId,
        story_id: topicId,
        visitor_id: visitorId,
        interaction_type: "donation_button_clicked",
      });
    } catch (error) {
      console.error("Failed to track donation button click:", error);
    }
    
    onClick();
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="gap-2"
    >
      <Heart className="h-4 w-4" />
      <span>{buttonText}</span>
    </Button>
  );
};
