// Content validation utility to prevent AI hallucination
export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  fabricatedTopics: string[];
  missingSourceRefs: string[];
  score: number; // 0-100 factual grounding score
}

export interface SlideContent {
  slideNumber: number;
  content: string;
  altText: string;
}

export class ContentValidator {
  private forbiddenFabrications = [
    'ai study hack', 'ai hack', 'study hack', 'technology trend', 'viral video',
    'social media trend', 'tiktok trend', 'instagram trend', 'goes viral',
    'sparks controversy', 'divides opinion', 'causes outrage', 'breaks internet',
    'generational clash', 'generational conflict', 'young vs old',
    'modern vs traditional', 'digital divide'
  ];

  private sourceIndicators = [
    'according to', 'reported by', 'stated', 'said', 'revealed', 'announced',
    'confirmed', 'disclosed', 'mentioned', 'noted', 'explained'
  ];

  private opinionIndicators = [
    'will boost', 'will improve', 'will reduce', 'will increase', 'will help', 
    'will benefit', 'is expected to', 'should lead to', 'aims to', 'hopes to',
    'plans to', 'believes', 'feels', 'thinks', 'could help', 'might improve',
    'appears to be', 'seems to suggest', 'indicates that', 'suggests that'
  ];

  private attributionWords = [
    'says', 'claims', 'states', 'according to', 'believes', 'argues',
    'suggests', 'maintains', 'calls it', 'describes', 'explains',
    'told', 'added', 'noted', 'commented'
  ];

  /**
   * Validates generated slides against source material for factual accuracy
   */
  validateSlides(slides: SlideContent[], sourceTitle: string, sourceBody: string): ValidationResult {
    const issues: string[] = [];
    const fabricatedTopics: string[] = [];
    const missingSourceRefs: string[] = [];
    
    const sourceText = (sourceTitle + ' ' + sourceBody).toLowerCase();
    
    for (const slide of slides) {
      const slideContent = slide.content.toLowerCase();
      
      // Check for forbidden fabrications
      for (const fabrication of this.forbiddenFabrications) {
        if (slideContent.includes(fabrication) && !sourceText.includes(fabrication)) {
          fabricatedTopics.push(`Slide ${slide.slideNumber}: "${fabrication}" not found in source`);
        }
      }
      
      // Check for opinion statements presented as facts
      for (const opinion of this.opinionIndicators) {
        if (slideContent.includes(opinion)) {
          // Check if it's properly attributed
          const hasAttribution = this.attributionWords.some(attr => 
            slideContent.includes(attr.toLowerCase())
          );
          if (!hasAttribution) {
            issues.push(`Slide ${slide.slideNumber}: Opinion/prediction "${opinion}" presented as fact without attribution`);
          }
        }
      }
      
      // Check for technology/AI mentions without source support
      if (this.hasTechMention(slideContent) && !this.hasTechMention(sourceText)) {
        fabricatedTopics.push(`Slide ${slide.slideNumber}: Technology angle not supported by source`);
      }
      
      // Check for social media mentions without source support
      if (this.hasSocialMediaMention(slideContent) && !this.hasSocialMediaMention(sourceText)) {
        fabricatedTopics.push(`Slide ${slide.slideNumber}: Social media angle not supported by source`);
      }
      
      // Check for controversy mentions without source support
      if (this.hasControversyMention(slideContent) && !this.hasControversyMention(sourceText)) {
        fabricatedTopics.push(`Slide ${slide.slideNumber}: Controversy not mentioned in source`);
      }
    }
    
    // Calculate factual grounding score
    const totalChecks = slides.length * 4; // 4 checks per slide
    const failedChecks = fabricatedTopics.length;
    const score = Math.max(0, Math.round((totalChecks - failedChecks) / totalChecks * 100));
    
    const allIssues = [...fabricatedTopics, ...missingSourceRefs];
    
    return {
      isValid: allIssues.length === 0,
      issues: allIssues,
      fabricatedTopics,
      missingSourceRefs,
      score
    };
  }

  /**
   * Checks if content mentions technology/AI topics
   */
  private hasTechMention(text: string): boolean {
    const techKeywords = [
      'ai', 'artificial intelligence', 'technology', 'tech', 'app', 'digital',
      'algorithm', 'machine learning', 'automation', 'smart', 'cyber',
      'online', 'internet', 'web', 'computer', 'software', 'hack'
    ];
    
    return techKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Checks if content mentions social media
   */
  private hasSocialMediaMention(text: string): boolean {
    const socialKeywords = [
      'social media', 'facebook', 'twitter', 'instagram', 'tiktok', 'youtube',
      'linkedin', 'snapchat', 'viral', 'trending', 'hashtag', 'post', 'share',
      'likes', 'followers', 'influencer', 'content creator'
    ];
    
    return socialKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Checks if content mentions controversy or conflict
   */
  private hasControversyMention(text: string): boolean {
    const controversyKeywords = [
      'controversy', 'controversial', 'outrage', 'angry', 'furious', 'clash',
      'conflict', 'battle', 'war', 'divides', 'splits', 'sparks debate',
      'backlash', 'criticism', 'slammed', 'blasted'
    ];
    
    return controversyKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Suggests corrections for fabricated content
   */
  suggestCorrections(issues: string[], sourceTitle: string): string[] {
    const corrections: string[] = [];
    
    for (const issue of issues) {
      if (issue.includes('Technology angle')) {
        corrections.push('Remove technology references and focus on the actual events described in the source');
      }
      if (issue.includes('Social media angle')) {
        corrections.push('Remove social media references and use the real story details from the source');
      }
      if (issue.includes('Controversy')) {
        corrections.push('Remove controversy language and describe only the events mentioned in the source');
      }
      if (issue.includes('hack')) {
        corrections.push('Remove "hack" references - focus on the factual achievements described in the source');
      }
    }
    
    return corrections;
  }
}