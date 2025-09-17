import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractionResult {
  success: boolean;
  extractedContent?: string;
  contentType?: string;
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
    console.log('📁 Processing file upload for content extraction');

    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const topicId = formData.get('topicId') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    if (!topicId) {
      throw new Error('No topic ID provided');
    }

    console.log('📄 Processing file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      topicId: topicId
    });

    // Validate file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('File size exceeds 20MB limit');
    }

    // Get file content as ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    let extractedContent: string;
    let contentType: string;

    // Extract content based on file type
    let rawContent: string;
    if (file.type.startsWith('image/')) {
      contentType = 'image';
      rawContent = await extractFromImage(fileBuffer, file.name);
    } else if (file.type === 'application/pdf') {
      contentType = 'pdf';
      rawContent = await extractFromPDF(fileBuffer);
    } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      contentType = 'text';
      rawContent = await extractFromText(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    // Process all content through DeepSeek for consistency with existing pipeline
    extractedContent = await processContentWithDeepSeek(rawContent, contentType);

    // Validate extracted content
    if (!extractedContent || extractedContent.length < 50) {
      throw new Error('Insufficient content extracted - need at least 50 characters');
    }

    console.log('✅ Content extracted successfully:', {
      contentType,
      extractedLength: extractedContent.length,
      preview: extractedContent.substring(0, 100) + '...'
    });

    const result: ExtractionResult = {
      success: true,
      extractedContent,
      contentType
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Content extraction failed:', error);
    
    const errorResult: ExtractionResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during content extraction'
    };

    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});