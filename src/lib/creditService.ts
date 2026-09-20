import { supabase } from '@/integrations/supabase/client';

import { REEL_CREDIT_COST } from '@/lib/billing';

/** Display-only mirror of the server rate card. Charging happens server-side. */
export const CREDIT_COSTS = { STORY_REEL: REEL_CREDIT_COST } as const;

export class CreditService {
  static async getUserCredits(userId: string) {
    const { data, error } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch credits: ${error.message}`);
    }

    return data || {
      credits_balance: 0,
      total_credits_purchased: 0,
      total_credits_used: 0
    };
  }

  static async hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
    try {
      const credits = await this.getUserCredits(userId);
      return credits.credits_balance >= amount;
    } catch (error) {
      console.error('Error checking credits:', error);
      return false;
    }
  }

  static async generateStoryIllustration(
    storyId: string, 
    model?: string
  ): Promise<{
    success: boolean;
    illustration_url?: string;
    error?: string;
    credits_used?: number;
    new_balance?: number;
    used_fallback?: boolean;
    fallback_reason?: string;
    fallback_model?: string;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('story-illustrator', {
        body: { 
          storyId,
          model: model || 'gpt-image-2-medium'
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return data;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}