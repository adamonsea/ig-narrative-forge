import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role key for database operations
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ExtractionResult {
  success: boolean;
  extractedContent?: string;
  contentType?: string;
  articleId?: string;
  sharedContentId?: string;
  error?: string;
}

// Extract text from images using OpenAI Vision API (OCR only)
async function extractFromImage(fileBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(fileBuffer);
  const base64 = btoa(String.fromCharCode(...bytes));
  const mimeType = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  console.log('🔍 Extracting text from image using OpenAI Vision API');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all readable text from this image. Return only the raw text content, maintaining structure when possible. If this appears to be a screenshot of an article or webpage, focus on the main content and ignore navigation elements, ads, or sidebar content.

If no meaningful text is found, return "NO_TEXT_FOUND".`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI Vision API error:', errorData);
    throw new Error(`Vision API failed: ${response.status}`);
  }

  const data = await response.json();
  const extractedText = data.choices[0]?.message?.content?.trim();

  if (!extractedText || extractedText === 'NO_TEXT_FOUND') {
    throw new Error('No readable text found in image');
  }

  return extractedText;
}

// Process and rewrite content using DeepSeek API for consistency
async function processContentWithDeepSeek(rawContent: string, contentType: string): Promise<string> {
  const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
  if (!deepseekApiKey) {
    throw new Error('DeepSeek API key not configured');
  }

  console.log('🤖 Processing content with DeepSeek API');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deepseekApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a professional content editor. Clean up and structure the provided ${contentType} content for publication. Maintain the original meaning and key information while improving readability and flow.

Guidelines:
- Fix any OCR errors or formatting issues
- Structure content with clear paragraphs
- Maintain factual accuracy and original meaning
- Remove irrelevant navigation text or UI elements
- Ensure proper grammar and punctuation
- Keep the content concise but complete

Return only the cleaned, structured content without any additional commentary.`
        },
        {
          role: 'user',
          content: rawContent
        }
      ],
      max_tokens: 4000,
      temperature: 0.3,
      stream: false
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('DeepSeek API error:', errorData);
    throw new Error(`DeepSeek API failed: ${response.status}`);
  }

  const data = await response.json();
  const processedContent = data.choices[0]?.message?.content?.trim();

  if (!processedContent) {
    throw new Error('No content returned from DeepSeek');
  }

  return processedContent;
}

// Extract text from PDF using simple text extraction
async function extractFromPDF(fileBuffer: ArrayBuffer): Promise<string> {
  // For now, we'll use a simple approach and rely on the user to provide text
  // In a production system, you'd want to use a proper PDF parsing library
  console.log('📄 PDF parsing not fully implemented - using placeholder');
  
  // This is a placeholder - in production you'd want to use:
  // - pdf-parse library
  // - Or call a dedicated PDF extraction service
  // - Or use OCR on PDF pages
  
  throw new Error('PDF extraction not yet supported - please convert to text or image format');
}

// Extract text from text files
async function extractFromText(fileBuffer: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(fileBuffer);
  
  if (!text.trim()) {
    throw new Error('Text file is empty');
  }
  
  return text.trim();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get('content-type');
    let file: File;
    let topicId: string;
    let fileBuffer: ArrayBuffer;

    // Handle both multipart form data and JSON with storage URLs
    if (contentType && contentType.includes('multipart/form-data')) {
      // Original direct file upload
      const formData = await req.formData();
      file = formData.get('file') as File;
      topicId = formData.get('topicId') as string;
      
      if (!file) {
        throw new Error('No file provided');
      }
      
      fileBuffer = await file.arrayBuffer();
      console.log('📁 Processing direct file upload:', file.name, file.type, `${Math.round(file.size / 1024)}KB`);
    } else {
      // JSON with storage file URL
      const body = await req.json();
      const { fileUrl, fileName, fileType, topicId: bodyTopicId } = body;
      
      if (!fileUrl || !fileName || !fileType) {
        throw new Error('File URL, name, and type are required');
      }
      
      topicId = bodyTopicId;
      
      // Download file from storage
      console.log('📁 Downloading file from storage:', fileName);
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      
      fileBuffer = await response.arrayBuffer();
      
      // Create file-like object for compatibility
      file = new File([fileBuffer], fileName, { type: fileType });
      console.log('📁 Processing storage file:', fileName, fileType, `${Math.round(fileBuffer.byteLength / 1024)}KB`);
    }

    if (!topicId) {
      throw new Error('Topic ID is required');
    }

    // Validate file size (20MB limit)
    if (fileBuffer.byteLength > 20 * 1024 * 1024) {
      throw new Error('File size exceeds 20MB limit');
    }
    
    let extractedContent: string;
    let extractionContentType: string;

    // Extract content based on file type
    let rawContent: string;
    if (file.type.startsWith('image/')) {
      extractionContentType = 'image';
      rawContent = await extractFromImage(fileBuffer, file.name);
    } else if (file.type === 'application/pdf') {
      extractionContentType = 'pdf';
      rawContent = await extractFromPDF(fileBuffer);
    } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      extractionContentType = 'text';
      rawContent = await extractFromText(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    // Process all content through DeepSeek for consistency with existing pipeline
    extractedContent = await processContentWithDeepSeek(rawContent, extractionContentType);

    // Validate extracted content
    if (!extractedContent || extractedContent.length < 50) {
      throw new Error('Insufficient content extracted from file');
    }

    console.log('✅ Content extraction successful:', extractedContent.substring(0, 100) + '...');

    // Now handle database operations with service role permissions
    console.log('💾 Saving content to database with service role');
    
    const wordCount = extractedContent.split(/\s+/).length;
    const sourceUrl = `manual-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const title = `Manual Upload: ${file.name.replace(/\.[^/.]+$/, "")}`;

    // Check for existing shared content to prevent duplicates
    const { data: existingContent } = await supabase
      .from('shared_article_content')
      .select('id')
      .eq('url', sourceUrl)
      .maybeSingle();

    let sharedContentId: string;

    if (existingContent) {
      sharedContentId = existingContent.id;
      console.log('📋 Using existing shared content');
    } else {
      // Create new shared content
      const { data: sharedContent, error: sharedError } = await supabase
        .from('shared_article_content')
        .insert({
          url: sourceUrl,
          normalized_url: sourceUrl,
          title: title,
          body: extractedContent,
          author: 'Manual Upload',
          word_count: wordCount,
          language: 'en',
          source_domain: 'manual-upload.local'
        })
        .select()
        .single();

      if (sharedError) {
        console.error('❌ Failed to create shared content:', sharedError);
        throw new Error(`Failed to create shared content: ${sharedError.message}`);
      }
      sharedContentId = sharedContent.id;
      console.log('✅ Created shared content:', sharedContentId);
    }

    // Check for existing topic article
    const { data: existingTopicArticle } = await supabase
      .from('topic_articles')
      .select('id')
      .eq('shared_content_id', sharedContentId)
      .eq('topic_id', topicId)
      .maybeSingle();

    let topicArticleId: string;

    if (existingTopicArticle) {
      topicArticleId = existingTopicArticle.id;
      console.log('📋 Using existing topic article');
    } else {
      // Create new topic article
      const { data: topicArticle, error: topicError } = await supabase
        .from('topic_articles')
        .insert({
          shared_content_id: sharedContentId,
          topic_id: topicId,
          regional_relevance_score: 75,
          content_quality_score: 80,
          processing_status: 'new',
          import_metadata: {
            manual_upload: true,
            original_filename: file.name,
            upload_date: new Date().toISOString(),
            extracted_via: extractionContentType
          }
        })
        .select()
        .single();

      if (topicError) {
        console.error('❌ Failed to create topic article:', topicError);
        throw new Error(`Failed to create topic article: ${topicError.message}`);
      }
      topicArticleId = topicArticle.id;
      console.log('✅ Created topic article:', topicArticleId);
    }

    console.log('🎉 Successfully processed and saved content to database');

    return new Response(JSON.stringify({
      success: true,
      extractedContent,
      contentType: extractionContentType,
      originalFileName: file.name,
      wordCount,
      articleId: topicArticleId,
      sharedContentId: sharedContentId,
      title
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Content extraction error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Content extraction failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});