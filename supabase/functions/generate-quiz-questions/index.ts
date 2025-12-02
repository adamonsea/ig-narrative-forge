import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sensitive topic patterns to AVOID generating quizzes about
const SENSITIVE_PATTERNS = [
  /\b(child|children|minor|underage|paedophile|pedophile|safeguarding)\b.*\b(abuse|assault|harm|victim|exploitation)\b/i,
  /\b(abuse|assault|harm|victim|exploitation)\b.*\b(child|children|minor|underage)\b/i,
  /\b(murder|manslaughter|homicide|killing)\b/i,
  /\b(tribunal|inquest|coroner)\b/i,
  /\b(sexual offence|sexual assault|rape|indecent)\b/i,
  /\b(suicide|self-harm)\b/i,
  /\b(missing child|abduction|kidnap)\b/i,
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (!deepseekApiKey) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get request body for optional topic filter
    let targetTopicId: string | null = null;
    try {
      const body = await req.json();
      targetTopicId = body.topicId || null;
    } catch {
      // No body provided, process all enabled topics
    }

    console.log('Starting quiz question generation with DeepSeek Reasoner', { targetTopicId });

    // Get topics with quiz cards enabled
    let topicsQuery = supabase
      .from('topic_insight_settings')
      .select('topic_id, topics!inner(id, name, slug)')
      .eq('quiz_cards_enabled', true);
    
    if (targetTopicId) {
      topicsQuery = topicsQuery.eq('topic_id', targetTopicId);
    }

    const { data: topicsSettings, error: topicsError } = await topicsQuery;

    if (topicsError) {
      console.error('Error fetching topics:', topicsError);
      throw topicsError;
    }

    if (!topicsSettings || topicsSettings.length === 0) {
      console.log('No topics with quiz cards enabled');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No topics with quiz cards enabled',
        questionsGenerated: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalQuestionsGenerated = 0;
    const results: any[] = [];

    for (const setting of topicsSettings) {
      const topicId = setting.topic_id;
      const topicName = (setting.topics as any)?.name || 'Unknown';
      
      console.log(`Processing topic: ${topicName} (${topicId})`);

      // Get recent published stories that don't have quiz questions yet
      const { data: stories, error: storiesError } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          topic_article_id,
          topic_articles!inner(
            topic_id,
            shared_content_id,
            shared_article_content!inner(
              title,
              body,
              url
            )
          )
        `)
        .eq('topic_articles.topic_id', topicId)
        .in('status', ['ready', 'published'])
        .eq('is_published', true)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(30);

      if (storiesError) {
        console.error(`Error fetching stories for topic ${topicId}:`, storiesError);
        results.push({ topicId, topicName, error: storiesError.message, questionsGenerated: 0 });
        continue;
      }

      if (!stories || stories.length === 0) {
        console.log(`No recent stories for topic ${topicId}`);
        results.push({ topicId, topicName, questionsGenerated: 0, reason: 'no_recent_stories' });
        continue;
      }

      // Filter out stories that already have quiz questions
      const { data: existingQuestions } = await supabase
        .from('quiz_questions')
        .select('source_story_id')
        .in('source_story_id', stories.map(s => s.id));

      const existingStoryIds = new Set((existingQuestions || []).map(q => q.source_story_id));
      const storiesWithoutQuiz = stories.filter(s => !existingStoryIds.has(s.id));

      if (storiesWithoutQuiz.length === 0) {
        console.log(`All recent stories already have quizzes for topic ${topicId}`);
        results.push({ topicId, topicName, questionsGenerated: 0, reason: 'all_have_quizzes' });
        continue;
      }

      // Process up to 10 stories per topic per run
      const storiesToProcess = storiesWithoutQuiz.slice(0, 10);
      let topicQuestionsGenerated = 0;

      for (const story of storiesToProcess) {
        const content = (story.topic_articles as any)?.shared_article_content;
        if (!content?.body || content.body.length < 200) {
          console.log(`Skipping story ${story.id}: insufficient content`);
          continue;
        }

        // Check for sensitive content
        const fullText = `${content.title || ''} ${content.body}`;
        const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(fullText));
        
        if (isSensitive) {
          console.log(`Skipping story ${story.id}: sensitive content detected`);
          continue;
        }

        // Generate quiz question using DeepSeek
        try {
          const quizQuestion = await generateQuizQuestion(
            deepseekApiKey,
            content.title,
            content.body.substring(0, 3000),
            topicName
          );

          if (quizQuestion) {
            const { error: insertError } = await supabase
              .from('quiz_questions')
              .insert({
                topic_id: topicId,
                source_story_id: story.id,
                question_text: quizQuestion.question,
                options: quizQuestion.options,
                correct_option: quizQuestion.correct_option,
                explanation: quizQuestion.explanation,
                difficulty: quizQuestion.difficulty || 'medium',
                category: quizQuestion.category || 'factual',
                valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                is_published: true,
                option_distribution: { A: 0, B: 0, C: 0, D: 0 }
              });

            if (insertError) {
              console.error(`Error inserting quiz question for story ${story.id}:`, insertError);
            } else {
              topicQuestionsGenerated++;
              totalQuestionsGenerated++;
              console.log(`Created quiz question for story ${story.id}`);
            }
          }
        } catch (genError) {
          console.error(`Error generating quiz for story ${story.id}:`, genError);
        }
      }

      results.push({ 
        topicId, 
        topicName, 
        questionsGenerated: topicQuestionsGenerated,
        storiesProcessed: storiesToProcess.length
      });
    }

    // Clean up expired quiz questions
    const { error: cleanupError } = await supabase
      .from('quiz_questions')
      .delete()
      .lt('valid_until', new Date().toISOString());

    if (cleanupError) {
      console.error('Error cleaning up expired quiz questions:', cleanupError);
    }

    console.log('Quiz generation complete', { totalQuestionsGenerated, results });

    return new Response(JSON.stringify({
      success: true,
      questionsGenerated: totalQuestionsGenerated,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Quiz generation error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateQuizQuestion(
  apiKey: string,
  articleTitle: string,
  articleBody: string,
  topicName: string
): Promise<{
  question: string;
  options: Array<{ label: string; text: string; is_correct: boolean }>;
  correct_option: string;
  explanation: string;
  difficulty: string;
  category: string;
} | null> {
  
  const systemPrompt = `You are creating a multiple-choice quiz question based on a news article. 

CRITICAL GUIDELINES:
- NEVER create questions about deaths, tragedies, crimes, accidents, or sensitive topics
- If the article is about something negative or distressing, respond with {"skip": true, "reason": "sensitive content"}
- Focus on: sports scores/results, business news, community events, achievements, statistics, openings, announcements
- Questions should be factual and verifiable from the article text
- The correct answer must be clearly stated in the article
- Create plausible but incorrect distractor options
- Keep the tone respectful and appropriate for all ages

QUESTION TYPES TO PREFER:
- Numerical facts (scores, amounts, dates, numbers)
- Names and places mentioned
- Outcomes and results
- New initiatives or announcements

You MUST respond with valid JSON only. No markdown, no explanation text outside of JSON.

If the article is suitable for a quiz, respond with this JSON structure:
{
  "question": "The quiz question text",
  "options": [
    {"label": "A", "text": "First option", "is_correct": false},
    {"label": "B", "text": "Second option", "is_correct": true},
    {"label": "C", "text": "Third option", "is_correct": false},
    {"label": "D", "text": "Fourth option", "is_correct": false}
  ],
  "correct_option": "B",
  "explanation": "Brief explanation of why this is correct",
  "difficulty": "easy|medium|hard",
  "category": "factual|numerical|temporal|contextual"
}

If the article is unsuitable, respond with:
{"skip": true, "reason": "explanation"}`;

  const userPrompt = `Create a quiz question based on this article from "${topicName}":

Title: ${articleTitle}

Content: ${articleBody}

Generate a single multiple-choice question with 4 options (A, B, C, D) where exactly one is correct. Respond ONLY with JSON.`;

  try {
    console.log('Calling DeepSeek Reasoner API for quiz generation...');
    
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
        ],
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in DeepSeek response');
      return null;
    }

    console.log('DeepSeek response received, parsing...');
    
    // Parse JSON response
    let quizData;
    try {
      quizData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse DeepSeek response as JSON:', content);
      return null;
    }
    
    // Check if AI decided to skip
    if (quizData.skip) {
      console.log(`AI skipped quiz generation: ${quizData.reason}`);
      return null;
    }

    // Validate the response
    if (!quizData.question || !quizData.options || quizData.options.length !== 4) {
      console.error('Invalid quiz data structure:', quizData);
      return null;
    }

    // Ensure exactly one correct answer
    const correctCount = quizData.options.filter((o: any) => o.is_correct).length;
    if (correctCount !== 1) {
      console.error('Invalid number of correct answers:', correctCount);
      return null;
    }

    console.log('Successfully generated quiz question');
    return quizData;
  } catch (error) {
    console.error('Error calling DeepSeek API:', error);
    return null;
  }
}
