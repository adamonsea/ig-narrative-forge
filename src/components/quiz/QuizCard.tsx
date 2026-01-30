import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuizQuestion, QuizResponse, useSubmitQuizResponse } from '@/hooks/useQuizCards';
import { Check, X, ExternalLink, Loader2, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface QuizCardProps {
  question: QuizQuestion;
  visitorId: string;
  userId?: string | null;
  topicSlug?: string;
  onAnswered?: (questionId: string) => void;
}

export const QuizCard = ({ question, visitorId, userId, topicSlug, onAnswered }: QuizCardProps) => {
  const navigate = useNavigate();
  const [result, setResult] = useState<QuizResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime] = useState<number>(Date.now());
  // Optimistic UI: show selected option immediately while backend processes
  const [optimisticSelection, setOptimisticSelection] = useState<string | null>(null);
  
  const submitResponse = useSubmitQuizResponse();

  // Immediate submit on option click - no separate submit button
  const handleOptionSelect = async (label: string) => {
    if (result || isSubmitting) return; // Already answered or submitting

    // Optimistic: show selection immediately
    setOptimisticSelection(label);
    setIsSubmitting(true);
    const responseTimeMs = Date.now() - startTime;

    try {
      const response = await submitResponse.mutateAsync({
        questionId: question.id,
        selectedOption: label,
        visitorId,
        userId: userId || undefined,
        responseTimeMs
      });

      setResult(response);
      // Don't call onAnswered immediately - let user see the result first
      // The answer is already persisted via localStorage in the mutation
    } catch (error) {
      console.error('Error submitting quiz response:', error);
      // Clear optimistic selection on error
      setOptimisticSelection(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReadStory = () => {
    if (question.source_story_id && topicSlug) {
      navigate(`/feed/${topicSlug}/story/${question.source_story_id}`);
    }
  };

  const getOptionStyle = (label: string) => {
    // Optimistic: highlight selected option while waiting for result
    if (!result && optimisticSelection === label) {
      return 'border-primary bg-primary/10 ring-2 ring-primary/30';
    }
    if (!result) {
      return 'border-border hover:border-primary/50 cursor-pointer';
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
    <Card className="w-full overflow-hidden rounded-2xl border-border/50 bg-card relative min-h-[500px] flex flex-col">
      {/* Card type indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full border-2 border-purple-dark z-10 shadow-sm">
        <span className="text-xs text-purple-dark font-medium tracking-wide whitespace-nowrap flex items-center gap-1">
          <Brain className="w-3 h-3" />
          Quiz
        </span>
      </div>

      <div className="flex-1 p-6 pt-14 flex flex-col">
        {/* Question */}
        <h3 className="text-lg font-semibold text-foreground mb-6 text-center leading-snug">
          {question.question_text}
        </h3>

        {/* Options - tap to answer immediately */}
        <div className="space-y-3 flex-1">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleOptionSelect(option.label)}
              disabled={!!result || isSubmitting}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-3',
                getOptionStyle(option.label),
                isSubmitting && 'opacity-50'
              )}
            >
              <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
                {option.label}
              </span>
              <span className="flex-1 text-sm text-foreground">{option.text}</span>
              {getOptionIcon(option.label)}
              
              {/* Show percentage if result exists */}
              {result && result.optionDistribution && (
                <span className="text-xs text-muted-foreground shrink-0 font-medium">
                  {result.optionDistribution[option.label] || 0}%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading state - more reassuring feedback */}
        {isSubmitting && (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Checking your answer...</span>
          </div>
        )}

        {/* Result section - immediate feedback */}
        {result && (
          <div className="mt-4 space-y-3">
            {/* Result banner */}
            <div className={cn(
              'p-4 rounded-xl text-center',
              result.isCorrect ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
            )}>
              <p className="font-bold text-lg">
                {result.isCorrect ? '🎉 Correct!' : '❌ Not quite!'}
              </p>
              {result.explanation && (
                <p className="text-sm mt-2 opacity-80">{result.explanation}</p>
              )}
            </div>

            {/* Community comparison stats */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>{result.totalResponses} answered</span>
              {result.correctRate !== undefined && (
                <span className="font-medium">{result.correctRate}% got it right</span>
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

        {/* Tap to answer hint (before answering) */}
        {!result && !isSubmitting && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            Tap an answer to see how you compare
          </p>
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
