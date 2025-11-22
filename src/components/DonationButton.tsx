import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DonationButtonProps {
  onClick: () => void;
  buttonText: string;
  topicId: string;
  visitorId: string;
  iconOnly?: boolean;
}

export const DonationButton = ({ onClick, buttonText, topicId, visitorId, iconOnly = false }: DonationButtonProps) => {
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

  if (iconOnly) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClick}
              className="w-9 h-9 p-0"
              aria-label={buttonText}
            >
              <Gift className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{buttonText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="gap-2"
    >
      <Gift className="h-4 w-4" />
      <span>{buttonText}</span>
    </Button>
  );
};
