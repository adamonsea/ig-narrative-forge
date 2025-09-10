// AI Provider-Specific Prompt Optimization Utilities
// Implements structured XML for OpenAI and hierarchical natural language for DeepSeek

interface PromptSection {
  context?: string;
  instructions?: string[];
  constraints?: string[];
  examples?: any[];
  outputFormat?: string;
  chainOfThought?: boolean;
}

interface OpenAIPromptOptions extends PromptSection {
  systemMessage?: string;
  includeExamples?: boolean;
}

interface DeepSeekPromptOptions extends PromptSection {
  useNumberedSections?: boolean;
  emphasizeKeyPoints?: boolean;
  includeProgressiveInstructions?: boolean;
}

export class OpenAIPromptBuilder {
  private sections: {
    context?: string;
    instructions?: string;
    constraints?: string;
    outputFormat?: string;
    examples?: string;
  } = {};

  context(content: string): this {
    this.sections.context = `<context>\n${content}\n</context>`;
    return this;
  }

  instructions(items: string[]): this {
    const instructionList = items.map(item => `  <instruction>${item}</instruction>`).join('\n');
    this.sections.instructions = `<instructions>\n${instructionList}\n</instructions>`;
    return this;
  }

  constraints(items: string[]): this {
    const constraintList = items.map(item => `  <constraint>${item}</constraint>`).join('\n');
    this.sections.constraints = `<constraints>\n${constraintList}\n</constraints>`;
    return this;
  }

  outputFormat(schema: any, description?: string): this {
    const formatDesc = description ? `\n  <description>${description}</description>` : '';
    this.sections.outputFormat = `<output_format>${formatDesc}\n  <schema>${JSON.stringify(schema, null, 2)}</schema>\n</output_format>`;
    return this;
  }

  examples(examples: any[]): this {
    const exampleList = examples.map((example, index) => 
      `  <example_${index + 1}>\n    ${JSON.stringify(example, null, 4)}\n  </example_${index + 1}>`
    ).join('\n');
    this.sections.examples = `<examples>\n${exampleList}\n</examples>`;
    return this;
  }

  build(): string {
    const orderedSections = [
      this.sections.context,
      this.sections.instructions,
      this.sections.constraints,
      this.sections.outputFormat,
      this.sections.examples
    ].filter(Boolean);

    return orderedSections.join('\n\n');
  }

  buildWithSystem(systemMessage: string): { system: string; user: string } {
    return {
      system: `<system_role>\n${systemMessage}\n</system_role>`,
      user: this.build()
    };
  }
}

export class DeepSeekPromptBuilder {
  private sections: {
    context?: string;
    mainInstructions?: string[];
    subInstructions?: { [key: number]: string[] };
    criticalPoints?: string[];
    outputSpec?: string;
    examples?: any[];
  } = {
    mainInstructions: [],
    subInstructions: {},
    criticalPoints: []
  };

  context(content: string): this {
    this.sections.context = `CONTEXT:\n${content}`;
    return this;
  }

  addInstruction(instruction: string, subItems?: string[]): this {
    const instructionNumber = this.sections.mainInstructions!.length + 1;
    this.sections.mainInstructions!.push(`${instructionNumber}. ${instruction}`);
    
    if (subItems) {
      this.sections.subInstructions![instructionNumber] = subItems;
    }
    
    return this;
  }

  addCriticalPoint(point: string): this {
    this.sections.criticalPoints!.push(`CRITICAL: ${point}`);
    return this;
  }

  outputFormat(description: string, schema?: any): this {
    let format = `OUTPUT FORMAT:\n${description}`;
    if (schema) {
      format += `\n\nRequired structure:\n${JSON.stringify(schema, null, 2)}`;
    }
    this.sections.outputSpec = format;
    return this;
  }

  examples(examples: any[], description?: string): this {
    this.sections.examples = examples;
    return this;
  }

  build(): string {
    const parts: string[] = [];

    // Add context
    if (this.sections.context) {
      parts.push(this.sections.context);
    }

    // Add critical points first for emphasis
    if (this.sections.criticalPoints!.length > 0) {
      parts.push(this.sections.criticalPoints!.join('\n'));
    }

    // Add main instructions with sub-items
    if (this.sections.mainInstructions!.length > 0) {
      const instructions = this.sections.mainInstructions!.map((instruction, index) => {
        const instructionNumber = index + 1;
        let result = instruction;
        
        if (this.sections.subInstructions![instructionNumber]) {
          const subItems = this.sections.subInstructions![instructionNumber]
            .map(item => `   • ${item}`)
            .join('\n');
          result += `\n${subItems}`;
        }
        
        return result;
      }).join('\n\n');
      
      parts.push(`INSTRUCTIONS:\n${instructions}`);
    }

    // Add examples if provided
    if (this.sections.examples && this.sections.examples.length > 0) {
      const exampleText = this.sections.examples
        .map((example, index) => `Example ${index + 1}:\n${JSON.stringify(example, null, 2)}`)
        .join('\n\n');
      parts.push(`EXAMPLES:\n${exampleText}`);
    }

    // Add output format last
    if (this.sections.outputSpec) {
      parts.push(this.sections.outputSpec);
    }

    return parts.join('\n\n');
  }
}

// Pre-built templates for common tasks
export const PromptTemplates = {
  
  // Content Generation Templates
  carouselGeneration: {
    openai: (article: any, slideCount: number, publication: string) => 
      new OpenAIPromptBuilder()
        .context(`Article: "${article.title}"\nContent: ${article.body}\nPublication: ${publication}`)
        .instructions([
          `Create exactly ${slideCount} engaging carousel slides`,
          'Make each slide conversational and informative',
          'Maintain accuracy to source material',
          'Include compelling visual descriptions',
          'Ensure accessibility with proper alt text'
        ])
        .constraints([
          'Each slide must be substantial (50-150 characters)',
          'No speculation beyond article content',
          'Maintain professional tone',
          'Visual prompts should be specific and actionable'
        ])
        .outputFormat({
          type: 'array',
          items: {
            slideNumber: 'number',
            content: 'string',
            visualPrompt: 'string',
            altText: 'string'
          }
        })
        .build(),

    deepseek: (article: any, slideCount: number, publication: string) =>
      new DeepSeekPromptBuilder()
        .context(`Transform this news article into ${slideCount} engaging carousel slides.\n\nARTICLE: "${article.title}"\n${article.body}\n\nSOURCE: ${publication}`)
        .addCriticalPoint(`Create exactly ${slideCount} slides - no more, no less`)
        .addInstruction('Analyze the article structure and identify key information', [
          'Main story elements and facts',
          'Supporting details and context',
          'Important quotes or statistics'
        ])
        .addInstruction('Create engaging slide content', [
          'Use conversational, accessible language',
          'Make each slide informative and substantial',
          'Include compelling visual descriptions',
          'Ensure accuracy to source material'
        ])
        .addInstruction('Format for social media consumption', [
          'Keep slides concise but informative',
          'Use proper accessibility alt text',
          'Create specific, actionable visual prompts'
        ])
        .outputFormat('Return as JSON array with slideNumber, content, visualPrompt, and altText for each slide')
        .build()
  },

  // Content Extraction Templates
  contentExtraction: {
    openai: (url: string) =>
      new OpenAIPromptBuilder()
        .context(`URL to extract: ${url}`)
        .instructions([
          'Extract the main article content from the webpage',
          'Identify article title, body content, author, and publication date',
          'Focus on the primary article text, excluding navigation and sidebar content',
          'Preserve formatting and structure where relevant'
        ])
        .constraints([
          'Extract complete article text, not summaries',
          'Exclude advertisements and navigation elements',
          'Maintain original tone and style',
          'Return structured data only'
        ])
        .outputFormat({
          title: 'string',
          body: 'string', 
          author: 'string|null',
          published_at: 'ISO date string|null',
          word_count: 'number'
        })
        .build(),

    deepseek: (url: string) =>
      new DeepSeekPromptBuilder()
        .context(`Extract clean article content from this webpage: ${url}`)
        .addCriticalPoint('Focus on the main article content only')
        .addInstruction('Identify the primary article elements', [
          'Main headline/title',
          'Complete article body text',
          'Author byline if available',
          'Publication timestamp if available'
        ])
        .addInstruction('Clean and structure the content', [
          'Remove navigation, ads, and sidebar content',
          'Preserve paragraph structure and formatting',
          'Maintain original tone and style',
          'Calculate accurate word count'
        ])
        .outputFormat('JSON object with title, body, author, published_at, and word_count fields')
        .build()
  },

  // URL Recovery Templates
  urlRecovery: {
    deepseek: (failedUrl: string, sourceName: string, domain: string) =>
      new DeepSeekPromptBuilder()
        .context(`The RSS/news feed URL "${failedUrl}" for "${sourceName}" (${domain}) is not working.`)
        .addCriticalPoint('Focus on the most likely working URLs for this specific domain')
        .addInstruction('Analyze common RSS feed patterns', [
          'Standard paths: /feed, /rss, /news/feed, /feed.xml',
          'Domain-specific variations',
          'Alternative feed formats (Atom feeds)',
          'Subdomain possibilities'
        ])
        .addInstruction('Generate specific URL suggestions', [
          'Provide 3-5 most likely alternatives',
          'Order by probability of success',
          'Include brief reasoning for each suggestion'
        ])
        .outputFormat('JSON object with suggestedUrls array and reasoning string', {
          suggestedUrls: ['string'],
          reasoning: 'string'
        })
        .build()
  }
};

// Utility functions for prompt optimization
export function optimizePromptForProvider(prompt: string, provider: 'openai' | 'deepseek'): string {
  if (provider === 'openai') {
    // Add XML structure if not already present
    if (!prompt.includes('<') || !prompt.includes('>')) {
      return `<task>\n${prompt}\n</task>`;
    }
    return prompt;
  } else {
    // DeepSeek: ensure hierarchical structure
    if (!prompt.includes('1.') && !prompt.includes('INSTRUCTIONS:')) {
      const lines = prompt.split('\n');
      const instructions = lines.map((line, index) => `${index + 1}. ${line.trim()}`).join('\n');
      return `INSTRUCTIONS:\n${instructions}`;
    }
    return prompt;
  }
}

export function calculateTokenEstimate(prompt: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(prompt.length / 4);
}

export function validatePromptStructure(prompt: string, provider: 'openai' | 'deepseek'): {
  valid: boolean;
  suggestions: string[];
} {
  const suggestions: string[] = [];
  
  if (provider === 'openai') {
    if (!prompt.includes('<') || !prompt.includes('>')) {
      suggestions.push('Consider using XML structure for better OpenAI comprehension');
    }
    if (!prompt.includes('<context>') && !prompt.includes('<instructions>')) {
      suggestions.push('Add <context> and <instructions> sections for clarity');
    }
  } else {
    if (!prompt.includes('CRITICAL:') && !prompt.includes('IMPORTANT:')) {
      suggestions.push('Consider adding CRITICAL: or IMPORTANT: emphasis for key points');
    }
    if (!prompt.match(/\d+\./)) {
      suggestions.push('Use numbered sections (1., 2., 3.) for better structure');
    }
  }
  
  return {
    valid: suggestions.length === 0,
    suggestions
  };
}