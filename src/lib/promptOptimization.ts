// Client-side AI Prompt Optimization Utilities
// For optimizing prompts sent from the frontend to edge functions

export interface PromptMetrics {
  estimatedTokens: number;
  complexity: 'simple' | 'moderate' | 'complex';
  provider: 'openai' | 'deepseek';
  suggestions: string[];
}

export interface OptimizationOptions {
  provider: 'openai' | 'deepseek';
  maxTokens?: number;
  includeFewShot?: boolean;
  useStructuredFormat?: boolean;
  optimizeForSpeed?: boolean;
}

/**
 * Analyzes a prompt and provides optimization metrics
 */
export function analyzePrompt(prompt: string, provider: 'openai' | 'deepseek'): PromptMetrics {
  const tokenEstimate = Math.ceil(prompt.length / 4); // Rough estimation
  const suggestions: string[] = [];
  
  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  
  // Analyze prompt complexity
  const hasMultipleInstructions = (prompt.match(/\d+\./g) || []).length > 3;
  const hasExamples = prompt.includes('example') || prompt.includes('Example');
  const hasConstraints = prompt.includes('constraint') || prompt.includes('must') || prompt.includes('should');
  const hasStructure = prompt.includes('{') || prompt.includes('<') || prompt.includes('JSON');
  
  if (hasMultipleInstructions && hasExamples) {
    complexity = 'complex';
  } else if (hasConstraints || hasStructure) {
    complexity = 'moderate';
  }
  
  // Provider-specific suggestions
  if (provider === 'openai') {
    if (!prompt.includes('<') && !prompt.includes('>')) {
      suggestions.push('Consider using XML structure (<context>, <instructions>) for better comprehension');
    }
    if (complexity === 'complex' && !hasStructure) {
      suggestions.push('Complex prompts benefit from structured output format specifications');
    }
    if (tokenEstimate > 3000) {
      suggestions.push('Consider breaking down large prompts into smaller, focused requests');
    }
  } else if (provider === 'deepseek') {
    if (!prompt.includes('CRITICAL:') && !prompt.includes('IMPORTANT:')) {
      suggestions.push('Use CRITICAL: or IMPORTANT: prefixes for key requirements');
    }
    if (!prompt.match(/\d+\./)) {
      suggestions.push('Structure instructions with numbered sections (1., 2., 3.)');
    }
    if (complexity === 'complex' && !prompt.includes('•')) {
      suggestions.push('Use bullet points (•) for sub-requirements and details');
    }
  }
  
  return {
    estimatedTokens: tokenEstimate,
    complexity,
    provider,
    suggestions
  };
}

/**
 * Optimizes a prompt for a specific AI provider
 */
export function optimizePromptForProvider(
  prompt: string, 
  options: OptimizationOptions
): { optimizedPrompt: string; improvements: string[] } {
  const improvements: string[] = [];
  let optimizedPrompt = prompt;
  
  if (options.provider === 'openai') {
    // Apply OpenAI-specific optimizations
    if (options.useStructuredFormat && !prompt.includes('<')) {
      const sections = prompt.split('\n\n');
      const structured = sections.map((section, index) => {
        if (index === 0) return `<context>\n${section}\n</context>`;
        if (section.toLowerCase().includes('format') || section.toLowerCase().includes('json')) {
          return `<output_format>\n${section}\n</output_format>`;
        }
        return `<instructions>\n${section}\n</instructions>`;
      }).join('\n\n');
      
      optimizedPrompt = structured;
      improvements.push('Applied XML structure for better OpenAI comprehension');
    }
    
    if (options.maxTokens && optimizedPrompt.length / 4 > options.maxTokens * 0.8) {
      optimizedPrompt = optimizedPrompt.substring(0, Math.floor(options.maxTokens * 3.2));
      improvements.push('Truncated prompt to fit token limit');
    }
  } else if (options.provider === 'deepseek') {
    // Apply DeepSeek-specific optimizations
    if (!prompt.includes('CRITICAL:') && options.useStructuredFormat) {
      optimizedPrompt = `CRITICAL: Follow these instructions precisely\n\n${optimizedPrompt}`;
      improvements.push('Added emphasis markers for better DeepSeek attention');
    }
    
    if (!prompt.match(/\d+\./) && options.useStructuredFormat) {
      const lines = optimizedPrompt.split('\n').filter(line => line.trim());
      const numbered = lines.map((line, index) => 
        line.startsWith('CRITICAL:') ? line : `${index}. ${line.trim()}`
      ).join('\n');
      
      optimizedPrompt = numbered;
      improvements.push('Applied numbered structure for better DeepSeek processing');
    }
  }
  
  return { optimizedPrompt, improvements };
}

/**
 * Creates a few-shot example prompt for better results
 */
export function createFewShotPrompt(
  basePrompt: string,
  examples: Array<{ input: any; output: any }>,
  provider: 'openai' | 'deepseek'
): string {
  if (provider === 'openai') {
    const exampleSection = examples.map((example, index) => 
      `<example_${index + 1}>\n  Input: ${JSON.stringify(example.input)}\n  Output: ${JSON.stringify(example.output)}\n</example_${index + 1}>`
    ).join('\n');
    
    return `${basePrompt}\n\n<examples>\n${exampleSection}\n</examples>`;
  } else {
    const exampleSection = examples.map((example, index) => 
      `Example ${index + 1}:\nInput: ${JSON.stringify(example.input)}\nOutput: ${JSON.stringify(example.output)}`
    ).join('\n\n');
    
    return `${basePrompt}\n\nEXAMPLES:\n${exampleSection}`;
  }
}

/**
 * Validates prompt structure and suggests improvements
 */
export function validatePromptStructure(
  prompt: string, 
  provider: 'openai' | 'deepseek'
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Basic validation
  if (prompt.length < 10) {
    errors.push('Prompt is too short to be effective');
  }
  
  if (prompt.length > 15000) {
    warnings.push('Prompt is very long and may hit token limits');
  }
  
  // Provider-specific validation
  if (provider === 'openai') {
    if (prompt.includes('temperature') || prompt.includes('max_tokens')) {
      warnings.push('Prompt contains API parameters - these should be set in the request, not the prompt');
    }
    
    if (prompt.includes('<') && !prompt.includes('</')) {
      errors.push('XML tags are opened but not properly closed');
    }
  } else if (provider === 'deepseek') {
    if (prompt.includes('<context>') || prompt.includes('<instructions>')) {
      warnings.push('Using XML structure with DeepSeek - consider natural language structure instead');
    }
    
    const criticalCount = (prompt.match(/CRITICAL:/g) || []).length;
    if (criticalCount > 5) {
      warnings.push('Too many CRITICAL markers may reduce their effectiveness');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Pre-built templates for common use cases
 */
export const ClientPromptTemplates = {
  contentSummary: {
    openai: `<context>
Article to summarize: {content}
Target audience: {audience}
</context>

<instructions>
Create a concise, engaging summary that captures the key points
Maintain the original tone while making it accessible
Focus on the most newsworthy and relevant information
</instructions>

<output_format>
Return a JSON object with "summary" and "key_points" fields
</output_format>`,

    deepseek: `CRITICAL: Create an accurate, engaging summary

INSTRUCTIONS:
1. Analyze the article content and identify key information
   • Main story elements and developments  
   • Important facts and statistics
   • Notable quotes or statements

2. Write a concise summary for the target audience
   • Use accessible language
   • Maintain original tone and accuracy
   • Focus on newsworthy elements

CONTENT: {content}
AUDIENCE: {audience}

OUTPUT FORMAT:
JSON object with summary and key_points fields`
  },

  keywordExtraction: {
    openai: `<context>
Text to analyze: {text}
Purpose: {purpose}
</context>

<instructions>
Extract relevant keywords and phrases from the text
Prioritize terms that are most meaningful for the stated purpose
Include both primary keywords and related terms
Consider semantic relevance and search intent
</instructions>

<output_format>
{"primary_keywords": ["term1", "term2"], "related_terms": ["term3", "term4"]}
</output_format>`,

    deepseek: `IMPORTANT: Extract meaningful keywords for the specified purpose

TEXT TO ANALYZE: {text}
PURPOSE: {purpose}

INSTRUCTIONS:
1. Identify primary keywords and phrases
   • Focus on terms most relevant to the purpose
   • Include both single words and phrases
   • Consider semantic meaning and context

2. Find related terms and concepts
   • Include synonyms and variations
   • Add contextually relevant terms
   • Consider search intent and user language

OUTPUT: JSON with primary_keywords and related_terms arrays`
  }
};

/**
 * Calculates the cost estimate for an API call
 */
export function estimateAPICallCost(
  prompt: string, 
  expectedOutput: number, 
  provider: 'openai' | 'deepseek'
): { inputTokens: number; outputTokens: number; estimatedCost: number } {
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = expectedOutput;
  
  // Rough cost estimates (as of 2024)
  let costPerInputToken = 0.000001; // $0.000001 default
  let costPerOutputToken = 0.000002; // $0.000002 default
  
  if (provider === 'openai') {
    costPerInputToken = 0.000003; // GPT-4 pricing estimate
    costPerOutputToken = 0.000006;
  } else if (provider === 'deepseek') {
    costPerInputToken = 0.0000007; // DeepSeek pricing estimate
    costPerOutputToken = 0.000002;
  }
  
  const estimatedCost = (inputTokens * costPerInputToken) + (outputTokens * costPerOutputToken);
  
  return {
    inputTokens,
    outputTokens,
    estimatedCost
  };
}