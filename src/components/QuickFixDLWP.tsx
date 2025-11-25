import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Wrench, CheckCircle2 } from 'lucide-react';

export const QuickFixDLWP = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fixed, setFixed] = useState(false);

  const handleFix = async () => {
    setLoading(true);
    try {
      // Update the scraping method for DLWP
      const { error: updateError } = await supabase
        .from('content_sources')
        .update({ 
          scraping_method: 'universal-scraper',
          updated_at: new Date().toISOString()
        })
        .eq('id', '9534c963-ea9e-48c1-9504-72920635d124');

      if (updateError) throw updateError;

      // Trigger a test scrape
      const { data, error: scrapeError } = await supabase.functions.invoke('universal-topic-scraper', {
        body: {
          topicId: 'd224e606-1a4c-4713-8135-1d30e2d6d0c6',
          sourceId: '9534c963-ea9e-48c1-9504-72920635d124',
          forceRescrape: true
        }
      });

      if (scrapeError) throw scrapeError;

      setFixed(true);
      toast({
        title: 'Success!',
        description: `DLWP blog fixed and test scrape initiated. Found ${data?.articlesStored || 0} articles.`,
      });
    } catch (error) {
      console.error('Error fixing DLWP:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fix DLWP blog',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Quick Fix: DLWP Blog
        </CardTitle>
        <CardDescription>
          Fix scraping configuration for De La Warr blog (dlwp.com) and trigger test scrape
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={handleFix} 
          disabled={loading || fixed}
          className="w-full"
        >
          {fixed ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Fixed!
            </>
          ) : loading ? (
            'Fixing...'
          ) : (
            'Fix DLWP Scraping'
          )}
        </Button>
        {fixed && (
          <p className="text-sm text-muted-foreground mt-2">
            ✓ Scraping method updated to universal-scraper<br />
            ✓ Test scrape triggered
          </p>
        )}
      </CardContent>
    </Card>
  );
};
