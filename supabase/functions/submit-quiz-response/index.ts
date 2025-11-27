import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { questionId, selectedOption, visitorId, userId, responseTimeMs } = await req.json();

    if (!questionId || !selectedOption || !visitorId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: questionId, selectedOption, visitorId' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing quiz response', { questionId, selectedOption, visitorId });

    // Get the question to check the correct answer
    const { data: question, error: questionError } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      console.error('Question not found:', questionError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Question not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user already responded to this question
    const { data: existingResponse } = await supabase
      .from('quiz_responses')
      .select('id, selected_option, is_correct')
      .eq('question_id', questionId)
      .eq('visitor_id', visitorId)
      .single();

    if (existingResponse) {
      // Return the existing response data without inserting a duplicate
      console.log('User already responded to this question');
      
      // Calculate percentages from current distribution
      const distribution = question.option_distribution || { A: 0, B: 0, C: 0, D: 0 };
      const total = question.total_responses || 1;
      const percentages: Record<string, number> = {};
      
      for (const [key, value] of Object.entries(distribution)) {
        percentages[key] = Math.round(((value as number) / total) * 100);
      }

      return new Response(JSON.stringify({
        success: true,
        alreadyAnswered: true,
        isCorrect: existingResponse.is_correct,
        correctOption: question.correct_option,
        explanation: question.explanation,
        selectedOption: existingResponse.selected_option,
        optionDistribution: percentages,
        totalResponses: total
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine if the answer is correct
    const isCorrect = selectedOption === question.correct_option;

    // Insert the response
    const { error: insertError } = await supabase
      .from('quiz_responses')
      .insert({
        question_id: questionId,
        visitor_id: visitorId,
        user_id: userId || null,
        selected_option: selectedOption,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs || null
      });

    if (insertError) {
      // Check if it's a duplicate constraint violation
      if (insertError.code === '23505') {
        console.log('Duplicate response detected');
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'You have already answered this question' 
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw insertError;
    }

    // Update question statistics atomically
    const currentDistribution = question.option_distribution || { A: 0, B: 0, C: 0, D: 0 };
    currentDistribution[selectedOption] = (currentDistribution[selectedOption] || 0) + 1;

    const newTotalResponses = (question.total_responses || 0) + 1;
    const newCorrectResponses = isCorrect 
      ? (question.correct_responses || 0) + 1 
      : (question.correct_responses || 0);

    const { error: updateError } = await supabase
      .from('quiz_questions')
      .update({
        total_responses: newTotalResponses,
        correct_responses: newCorrectResponses,
        option_distribution: currentDistribution
      })
      .eq('id', questionId);

    if (updateError) {
      console.error('Error updating question stats:', updateError);
      // Don't fail the response, stats update is secondary
    }

    // Calculate percentages for response
    const percentages: Record<string, number> = {};
    for (const [key, value] of Object.entries(currentDistribution)) {
      percentages[key] = Math.round(((value as number) / newTotalResponses) * 100);
    }

    console.log('Quiz response recorded successfully', { 
      questionId, 
      isCorrect, 
      totalResponses: newTotalResponses 
    });

    return new Response(JSON.stringify({
      success: true,
      isCorrect,
      correctOption: question.correct_option,
      explanation: question.explanation,
      selectedOption,
      optionDistribution: percentages,
      totalResponses: newTotalResponses,
      correctRate: Math.round((newCorrectResponses / newTotalResponses) * 100)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Submit quiz response error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});