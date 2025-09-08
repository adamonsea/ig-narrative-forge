import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface EmergencyContentButtonProps {
  topicId?: string;
  onSuccess?: () => void;
}

export const EmergencyContentButton: React.FC<EmergencyContentButtonProps> = ({ 
  topicId, 
  onSuccess 
}) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleEmergencyFix = async () => {
    if (!topicId) return;
    
    try {
      setLoading(true);
      
      // Call the emergency scrape fix function
      const { data, error } = await supabase.functions.invoke('emergency-scrape-fix', {
        body: {
          action: 'force_scrape',
          topic_id: topicId
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Emergency Fix Applied",
          description: `Created ${data.articles_created} emergency articles for this topic`,
        });
        
        // Call parent callback to refresh content
        onSuccess?.();
      } else {
        throw new Error(data.message || 'Emergency fix failed');
      }
      
    } catch (error: any) {
      console.error('Emergency fix error:', error);
      toast({
        title: "Emergency Fix Failed",
        description: error.message || "Failed to apply emergency fix",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleEmergencyFix}
      disabled={loading || !topicId}
      variant="destructive"
      size="sm"
      className="gap-2"
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      {loading ? 'Applying Emergency Fix...' : 'Emergency Fix'}
    </Button>
  );
};