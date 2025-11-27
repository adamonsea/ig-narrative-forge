import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { QuizQuestion, QuizResponse, useSubmitQuizResponse } from '@/hooks/useQuizCards';
import { Check, X, ExternalLink, Loader2, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface QuizCardProps {
  question: QuizQuestion;
  visitorId: string;
  topicSlug?: string;
  onAnswered?: (questionId: string) => void;
}

export const QuizCard = ({ question, visitorId, topicSlug, onAnswered }: QuizCardProps) => {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResponse | null>(null);
  const [startTime] = useState<number>(Date.now());
  
  const submitResponse = useSubmitQuizResponse();

  const handleOptionSelect = (label: string) => {
    if (result) return; // Already answered
    setSelectedOption(label);
  };

  const handleSubmit = async () => {
    if (!selectedOption || result) return;

    const responseTimeMs = Date.now() - startTime;

    try {
      const response = await submitResponse.mutateAsync({
        questionId: question.id,
        selectedOption,
        visitorId,
        responseTimeMs
      });

      setResult(response);
      onAnswered?.(question.id);
    } catch (error) {
      console.error('Error submitting quiz response:', error);
    }
  };

  const handleReadStory = () => {
    if (question.source_story_id && topicSlug) {
      navigate(`/feed/${topicSlug}/story/${question.source_story_id}`);
    }
  };

  const getOptionStyle = (label: string) => {
    if (!result) {
      return selectedOption === label
        ? 'border-primary bg-primary/10'
        : 'border-border hover:border-primary/50';
    }

    const isCorrect = label === result.correctOption;
    const isSelected = label === result.selectedOption;

    if (isCorrect) {
      return 'border-green-500 bg-green-500/10';
    }
    if (isSelected && !isCorrect) {
      return 'border-red-500 bg-red-500/10';
    }
    return 'border-border opacity-50';
  };

  const getOptionIcon = (label: string) => {
    if (!result) return null;

    const isCorrect = label === result.correctOption;
    const isSelected = label === result.selectedOption;

    if (isCorrect) {
      return <Check className="w-4 h-4 text-green-500" />;
    }
    if (isSelected && !isCorrect) {
      return <X className="w-4 h-4 text-red-500" />;
    }
    return null;
  };

  return (
    <Card className="w-full overflow-hidden rounded-2xl border-border/50 bg-card relative h-full flex flex-col">
      {/* Card type indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full border-2 border-purple-dark z-10 shadow-sm">
        <span className="text-xs text-purple-dark font-medium tracking-wide whitespace-nowrap flex items-center gap-1">
          <Brain className="w-3 h-3" />
          Quiz
        </span>
      </div>

      <div className="flex-1 p-6 pt-14 flex flex-col">
        {/* Question */}
        <h3 className="text-lg font-semibold text-foreground mb-4 text-center">
          {question.question_text}
        </h3>

        {/* Options */}
        <div className="space-y-2 flex-1">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleOptionSelect(option.label)}
              disabled={!!result}
              className={cn(
                'w-full p-3 rounded-lg border-2 transition-all text-left flex items-center gap-3',
                getOptionStyle(option.label),
                !result && 'cursor-pointer'
              )}
            >
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                {option.label}
              </span>
              <span className="flex-1 text-sm text-foreground">{option.text}</span>
              {getOptionIcon(option.label)}
              
              {/* Show percentage if result exists */}
              {result && result.optionDistribution && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {result.optionDistribution[option.label] || 0}%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Result section */}
        {result && (
          <div className="mt-4 space-y-3">
            {/* Result banner */}
            <div className={cn(
              'p-3 rounded-lg text-center',
              result.isCorrect ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
            )}>
              <p className="font-semibold">
                {result.isCorrect ? '🎉 Correct!' : '❌ Not quite!'}
              </p>
              {result.explanation && (
                <p className="text-sm mt-1 opacity-80">{result.explanation}</p>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{result.totalResponses} people answered</span>
              {result.correctRate !== undefined && (
                <span>{result.correctRate}% got it right</span>
              )}
            </div>

            {/* Read Story CTA */}
            {question.source_story_id && topicSlug && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReadStory}
                className="w-full"
              >
                Read the Story
                <ExternalLink className="w-3 h-3 ml-2" />
              </Button>
            )}
          </div>
        )}

        {/* Submit button (only before answering) */}
        {!result && (
          <Button
            onClick={handleSubmit}
            disabled={!selectedOption || submitResponse.isPending}
            className="w-full mt-4"
          >
            {submitResponse.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              'Submit Answer'
            )}
          </Button>
        )}
      </div>

      {/* Difficulty badge */}
      <div className="absolute bottom-3 right-3">
        <Badge variant="secondary" className="text-xs capitalize">
          {question.difficulty}
        </Badge>
      </div>
    </Card>
  );
};