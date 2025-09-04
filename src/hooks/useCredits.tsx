import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface UserCredits {
  credits_balance: number;
  total_credits_purchased: number;
  total_credits_used: number;
}

interface CreditTransaction {
  id: string;
  transaction_type: string;
  credits_amount: number;
  credits_balance_after: number;
  description: string | null;
  created_at: string;
}

export const useCredits = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCredits = async () => {
    if (!user) {
      setCredits(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching credits:', error);
        return;
      }

      setCredits(data || {
        credits_balance: 0,
        total_credits_purchased: 0,
        total_credits_used: 0
      });
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user) {
      setTransactions([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const addCredits = async (amount: number, description?: string) => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('add_user_credits', {
        p_user_id: user.id,
        p_credits_amount: amount,
        p_transaction_type: 'purchase',
        p_description: description || 'Credits purchased'
      });

      if (error) {
        console.error('Error adding credits:', error);
        toast.error('Failed to add credits');
        return false;
      }

      const result = data as { success: boolean; error?: string; new_balance?: number };
      if (result.success) {
        toast.success(`Added ${amount} credits successfully`);
        await fetchCredits();
        await fetchTransactions();
        return true;
      } else {
        toast.error(result.error || 'Failed to add credits');
        return false;
      }
    } catch (error) {
      console.error('Error adding credits:', error);
      toast.error('Failed to add credits');
      return false;
    }
  };

  const deductCredits = async (amount: number, description?: string, storyId?: string) => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('deduct_user_credits', {
        p_user_id: user.id,
        p_credits_amount: amount,
        p_description: description || 'Credits used',
        p_story_id: storyId
      });

      if (error) {
        console.error('Error deducting credits:', error);
        return false;
      }

      const result = data as { success: boolean; error?: string; current_balance?: number; new_balance?: number };
      if (result.success) {
        await fetchCredits();
        await fetchTransactions();
        return true;
      } else {
        if (result.error === 'Insufficient credits') {
          toast.error(`Insufficient credits. You need ${amount} credits but only have ${result.current_balance}.`);
        } else {
          toast.error(result.error || 'Failed to deduct credits');
        }
        return false;
      }
    } catch (error) {
      console.error('Error deducting credits:', error);
      return false;
    }
  };

  useEffect(() => {
    fetchCredits();
    fetchTransactions();
  }, [user]);

  return {
    credits,
    transactions,
    loading,
    addCredits,
    deductCredits,
    refreshCredits: fetchCredits,
    refreshTransactions: fetchTransactions
  };
};