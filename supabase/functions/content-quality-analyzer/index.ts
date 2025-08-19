import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QualityReport {
  overall_score: number;
  brand_safety: {
    score: number;
    issues: string[];
    safe: boolean;
  };
  content_quality: {
    score: number;
    readability: number;
    engagement_potential: number;
    factual_accuracy: number;
  };
  regional_relevance: {
    score: number;
    local_connections: string[];
    geographic_context: string;
  };
  recommendations: string[];
  compliance: {
    editorial_standards: boolean;
    copyright_safe: boolean;
    attribution_complete: boolean;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!supabaseUrl || !supabaseKey || !openAIApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { storyId, analysisType = 'full' } = await req.json();

    console.log('Starting quality analysis for story:', storyId);

    // Fetch story with slides and article data
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select(`
        *,
        slides (*),
        articles (*)
      `)
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      throw new Error(`Story not found: ${storyError?.message}`);
    }

    // Perform comprehensive quality analysis
    const qualityReport = await analyzeContentQuality(story, openAIApiKey);
    
    // Store analysis results
    await storeQualityReport(storyId, qualityReport, supabase);
    
    // Update story status based on analysis
    await updateStoryBasedOnQuality(storyId, qualityReport, supabase);
    
    console.log('Quality analysis completed for story:', storyId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        storyId,
        qualityReport
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in content-quality-analyzer function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function analyzeContentQuality(story: any, openAIApiKey: string): Promise<QualityReport> {
  const slideContent = story.slides
    ?.sort((a: any, b: any) => a.slide_number - b.slide_number)
    .map((slide: any) => `Slide ${slide.slide_number}: ${slide.content}`)
    .join('\n') || '';

  const analysisPrompt = `Analyze this news story and slides for quality, safety, and compliance:

ORIGINAL ARTICLE:
Title: ${story.articles?.title}
Content: ${story.articles?.body?.substring(0, 2000)}...
Author: ${story.articles?.author || 'Unknown'}
Source: ${story.articles?.source_url}

GENERATED SLIDES:
${slideContent}

ANALYSIS REQUIREMENTS:

1. BRAND SAFETY (Rate 0-100):
   - Check for controversial, offensive, or inappropriate content
   - Identify potential legal/ethical issues
   - Assess reputational risk

2. CONTENT QUALITY (Rate 0-100):
   - Readability and clarity
   - Engagement potential for social media
   - Factual accuracy and consistency with source
   - Writing quality and flow

3. REGIONAL RELEVANCE (Rate 0-100):
   - Local connection strength for Eastbourne/East Sussex
   - Geographic context inclusion
   - Community impact relevance

4. COMPLIANCE:
   - Editorial standards adherence
   - Copyright safety
   - Attribution completeness
   - Source credibility

5. RECOMMENDATIONS:
   - Specific improvement suggestions
   - Risk mitigation steps
   - Optimization opportunities

Return JSON format:
{
  "overall_score": 85,
  "brand_safety": {
    "score": 90,
    "issues": ["minor concern about..."],
    "safe": true
  },
  "content_quality": {
    "score": 80,
    "readability": 85,
    "engagement_potential": 75,
    "factual_accuracy": 90
  },
  "regional_relevance": {
    "score": 70,
    "local_connections": ["connection1", "connection2"],
    "geographic_context": "description"
  },
  "recommendations": ["improve...", "consider..."],
  "compliance": {
    "editorial_standards": true,
    "copyright_safe": true,
    "attribution_complete": true
  }
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert content quality analyst specializing in news content, brand safety, editorial compliance, and local news relevance. Provide thorough, objective analysis with specific actionable recommendations.' 
          },
          { role: 'user', content: analysisPrompt }
        ],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);

  } catch (error) {
    console.error('Error in AI quality analysis:', error);
    
    // Return fallback analysis
    return {
      overall_score: 60,
      brand_safety: {
        score: 80,
        issues: ['Analysis unavailable - manual review recommended'],
        safe: true
      },
      content_quality: {
        score: 60,
        readability: 70,
        engagement_potential: 60,
        factual_accuracy: 70
      },
      regional_relevance: {
        score: 50,
        local_connections: [],
        geographic_context: 'Could not analyze'
      },
      recommendations: ['Manual quality review required due to analysis error'],
      compliance: {
        editorial_standards: true,
        copyright_safe: true,
        attribution_complete: false
      }
    };
  }
}

async function storeQualityReport(storyId: string, report: QualityReport, supabase: any) {
  // Store detailed quality report
  const { error } = await supabase
    .from('quality_reports')
    .insert({
      story_id: storyId,
      overall_score: report.overall_score,
      brand_safety_score: report.brand_safety.score,
      content_quality_score: report.content_quality.score,
      regional_relevance_score: report.regional_relevance.score,
      brand_safety_issues: report.brand_safety.issues,
      recommendations: report.recommendations,
      compliance_data: report.compliance,
      analysis_data: report,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error storing quality report:', error);
  }
}

async function updateStoryBasedOnQuality(storyId: string, report: QualityReport, supabase: any) {
  let newStatus = 'draft';
  
  // Determine status based on quality scores
  if (report.overall_score >= 80 && report.brand_safety.safe && 
      report.compliance.editorial_standards && report.compliance.copyright_safe) {
    newStatus = 'ready';
  } else if (report.overall_score < 40 || !report.brand_safety.safe) {
    newStatus = 'rejected';
  } else {
    newStatus = 'needs_review';
  }

  // Update story with quality metadata
  const { error } = await supabase
    .from('stories')
    .update({
      status: newStatus,
      quality_score: report.overall_score,
      last_quality_check: new Date().toISOString()
    })
    .eq('id', storyId);

  if (error) {
    console.error('Error updating story status:', error);
  }

  // Log quality decision
  await supabase
    .from('system_logs')
    .insert({
      level: 'info',
      message: `Quality analysis completed for story ${storyId}: ${report.overall_score}/100, status: ${newStatus}`,
      context: {
        story_id: storyId,
        quality_score: report.overall_score,
        new_status: newStatus,
        brand_safe: report.brand_safety.safe
      },
      function_name: 'content-quality-analyzer'
    });
}