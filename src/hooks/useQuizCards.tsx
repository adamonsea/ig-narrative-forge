import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';

export interface QuizQuestion {
  id: string;
  topic_id: string;
  source_story_id: string | null;
  question_text: string;
  options: Array<{
    label: string;
    text: string;
    is_correct: boolean;
  }>;
  correct_option: string;
  explanation: string | null;
  difficulty: string;
  category: string;
  total_responses: number;
  correct_responses: number;
  option_distribution: Record<string, number>;
  valid_until: string;
  is_published: boolean;
  created_at: string;
}

export interface QuizResponse {
  success: boolean;
  isCorrect: boolean;
  correctOption: string;
  explanation: string | null;
  selectedOption: string;
  optionDistribution: Record<string, number>;
  totalResponses: number;
  correctRate?: number;
  alreadyAnswered?: boolean;
}

// Generate a persistent visitor ID for quiz deduplication
const getVisitorId = (): string => {
  const storageKey = 'quiz_visitor_id';
  let visitorId = localStorage.getItem(storageKey);
  
  if (!visitorId) {
    // Generate a simple fingerprint-based ID
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx!.textBaseline = 'top';
    ctx!.font = '14px Arial';
    ctx!.fillText('Quiz fingerprint', 2, 2);
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');
    
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    visitorId = 'quiz_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
    localStorage.setItem(storageKey, visitorId);
  }
  
  return visitorId;
};

// Track answered questions locally to avoid redundant API calls
const getAnsweredQuestions = (): Set<string> => {
  try {
    const stored = localStorage.getItem('quiz_answered');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const markQuestionAnswered = (questionId: string) => {
  const answered = getAnsweredQuestions();
  answered.add(questionId);
  localStorage.setItem('quiz_answered', JSON.stringify([...answered]));
};

export const useQuizCards = (topicId: string | undefined, quizEnabled: boolean) => {
  const [visitorId, setVisitorId] = useState<string>('');
  // Questions answered BEFORE this session (loaded from localStorage on mount) - these are filtered out
  const [persistedAnswered, setPersistedAnswered] = useState<Set<string>>(new Set());
  // Questions answered DURING this session - saved to localStorage but NOT filtered out until refresh
  const [sessionAnswered, setSessionAnswered] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVisitorId(getVisitorId());
      setPersistedAnswered(getAnsweredQuestions());
    }
  }, []);

  // Always fetch quiz questions when we have a topicId - the quizEnabled check 
  // happens in the queryFn to avoid race conditions where the setting loads after
  // the initial render, which would prevent the query from ever running
  const query = useQuery({
    queryKey: ['quiz-questions', topicId, quizEnabled],
    queryFn: async () => {
      if (!topicId) {
        return [];
      }
      
      // Return empty if quiz not enabled - but query still ran so it can refetch
      // when quizEnabled changes
      if (!quizEnabled) {
        console.log('Quiz questions: quizEnabled is false, returning empty');
        return [];
      }

      console.log('Quiz questions: fetching for topic', topicId);
      const { data, error } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('topic_id', topicId)
        .eq('is_published', true)
        .gt('valid_until', new Date().toISOString())
        .limit(20); // Fetch more to allow for randomization

      if (error) {
        console.error('Error fetching quiz questions:', error);
        throw error;
      }

      console.log('Quiz questions: fetched', data?.length || 0, 'questions');
      
      // Cast the JSONB fields properly
      const questions = (data || []).map(q => ({
        ...q,
        options: q.options as QuizQuestion['options'],
        option_distribution: q.option_distribution as Record<string, number>
      })) as QuizQuestion[];

      // Shuffle questions using Fisher-Yates for variety
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }

      // Return shuffled questions (limit to 10 for display)
      return questions.slice(0, 10);
    },
    enabled: !!topicId, // Always enable when we have topicId - quizEnabled check is in queryFn
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Filter out questions that were answered BEFORE this session
  // Questions answered during this session stay visible until refresh
  const unansweredQuestions = query.data?.filter(q => !persistedAnswered.has(q.id)) || [];

  // Combined set for checking if a question has been answered (either session)
  const allAnswered = new Set([...persistedAnswered, ...sessionAnswered]);

  return {
    ...query,
    questions: query.data || [],
    unansweredQuestions,
    answeredQuestions: allAnswered,
    visitorId,
    isQuestionAnswered: (questionId: string) => allAnswered.has(questionId),
    markAsAnswered: (questionId: string) => {
      // Save to localStorage for next session, but don't filter out immediately
      markQuestionAnswered(questionId);
      setSessionAnswered(prev => new Set([...prev, questionId]));
    }
  };
};

export const useSubmitQuizResponse = () => {
  return useMutation({
    mutationFn: async ({
      questionId,
      selectedOption,
      visitorId,
      responseTimeMs
    }: {
      questionId: string;
      selectedOption: string;
      visitorId: string;
      responseTimeMs?: number;
    }): Promise<QuizResponse> => {
      const { data, error } = await supabase.functions.invoke('submit-quiz-response', {
        body: {
          questionId,
          selectedOption,
          visitorId,
          responseTimeMs
        }
      });

      if (error) {
        throw error;
      }

      return data as QuizResponse;
    },
    onSuccess: (data, variables) => {
      // Mark question as answered locally - but DON'T invalidate queries
      // This keeps the same question visible with results until page refresh
      markQuestionAnswered(variables.questionId);
    }
  });
};

// Hook to get quiz stats for dashboard
export const useQuizStats = (topicId: string | undefined) => {
  return useQuery({
    queryKey: ['quiz-stats', topicId],
    queryFn: async () => {
      if (!topicId) return null;

      const { data, error } = await supabase.rpc('get_topic_quiz_stats', {
        p_topic_id: topicId,
        p_days: 7
      });

      if (error) {
        console.error('Error fetching quiz stats:', error);
        return null;
      }

      return data?.[0] || { quiz_responses_count: 0, correct_rate: 0 };
    },
    enabled: !!topicId,
    staleTime: 60 * 1000, // Cache for 1 minute
  });
};