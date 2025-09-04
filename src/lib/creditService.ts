import { supabase } from '@/integrations/supabase/client';

export interface CreditUsage {
  STORY_GENERATION: number;
  IMAGE_GENERATION: number;
  STORY_ILLUSTRATION: number;
  PREMIUM_FEATURES: number;
}

export const CREDIT_COSTS: CreditUsage = {
  STORY_GENERATION: 5,
  IMAGE_GENERATION: 3,
  STORY_ILLUSTRATION: 10,
  PREMIUM_FEATURES: 2,
};

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

  static async deductCredits(
    userId: string, 
    amount: number, 
    description: string, 
    storyId?: string
  ): Promise<{ success: boolean; error?: string; newBalance?: number }> {
    try {
      const { data, error } = await supabase.rpc('deduct_user_credits', {
        p_user_id: userId,
        p_credits_amount: amount,
        p_description: description,
        p_story_id: storyId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; new_balance?: number };
      return {
        success: result.success,
        error: result.error,
        newBalance: result.new_balance
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async addCredits(
    userId: string, 
    amount: number, 
    transactionType: string = 'purchase',
    description?: string
  ): Promise<{ success: boolean; error?: string; newBalance?: number }> {
    try {
      const { data, error } = await supabase.rpc('add_user_credits', {
        p_user_id: userId,
        p_credits_amount: amount,
        p_transaction_type: transactionType,
        p_description: description || 'Credits added'
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; new_balance?: number };
      return {
        success: result.success,
        error: result.error,
        newBalance: result.new_balance
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async generateStoryIllustration(storyId: string): Promise<{
    success: boolean;
    illustration_url?: string;
    error?: string;
    credits_used?: number;
    new_balance?: number;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('story-illustrator', {
        body: { storyId }
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