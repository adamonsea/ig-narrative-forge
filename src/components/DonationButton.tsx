import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DonationButtonProps {
  onClick: () => void;
  buttonText: string;
}

export const DonationButton = ({ onClick, buttonText }: DonationButtonProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2"
    >
      <Heart className="h-4 w-4" />
      <span className="hidden sm:inline">{buttonText}</span>
    </Button>
  );
};
