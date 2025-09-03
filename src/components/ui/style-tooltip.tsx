import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface StyleChoices {
  slidetype?: string;
  tone?: string;
  writing_style?: string;
  audience_expertise?: string;
}

interface StyleTooltipProps {
  styleChoices: StyleChoices;
  className?: string;
}

const getStyleDisplayName = (key: string, value: string): string => {
  const displayNames: Record<string, Record<string, string>> = {
    slidetype: {
      short: "Short Form",
      tabloid: "Tabloid",
      indepth: "In-Depth", 
      extensive: "Extensive"
    },
    tone: {
      conversational: "Conversational",
      formal: "Formal",
      engaging: "Engaging"
    },
    writing_style: {
      journalistic: "Journalistic",
      educational: "Educational",
      listicle: "Listicle",
      story_driven: "Story-Driven"
    },
    audience_expertise: {
      beginner: "Beginner",
      intermediate: "Intermediate", 
      advanced: "Advanced"
    }
  };

  return displayNames[key]?.[value] || value;
};

const getStyleLabel = (key: string): string => {
  const labels: Record<string, string> = {
    slidetype: "Slide Type",
    tone: "Tone",
    writing_style: "Writing Style",
    audience_expertise: "Audience Level"
  };
  
  return labels[key] || key;
};

export const StyleTooltip: React.FC<StyleTooltipProps> = ({ styleChoices, className = "" }) => {
  const hasStyleChoices = Object.keys(styleChoices).some(key => styleChoices[key as keyof StyleChoices]);

  if (!hasStyleChoices) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={`inline-flex items-center justify-center rounded-full w-4 h-4 bg-muted hover:bg-muted/80 transition-colors ${className}`}>
            <Info className="h-3 w-3 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="p-3 max-w-xs">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground mb-2">Style Choices</div>
            {Object.entries(styleChoices).map(([key, value]) => {
              if (!value) return null;
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    {getStyleLabel(key)}:
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {getStyleDisplayName(key, value)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};