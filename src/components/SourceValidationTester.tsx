import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ValidationResult {
  success: boolean;
  isAccessible: boolean;
  isValidRSS?: boolean;
  suggestedUrl?: string;
  discoveredFeeds?: string[];
  articleCount?: number;
  warnings: string[];
  error?: string;
}

export const SourceValidationTester = () => {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const testValidation = async () => {
    if (!url.trim()) {
      toast({
        title: "Please enter a URL",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('validate-content-source', {
        body: {
          url: url.trim(),
          sourceType: 'RSS',
          topicType: 'regional',
          region: 'Hastings',
          topicId: 'your-hastings-topic-id'
        }
      });

      if (error) {
        throw error;
      }

      setResult(data);
      
      if (data.success) {
        toast({
          title: "Validation Successful",
          description: data.suggestedUrl 
            ? `Auto-discovered RSS feed: ${data.suggestedUrl}`
            : "Source validated successfully"
        });
      }
    } catch (error) {
      console.error('Validation failed:', error);
      toast({
        title: "Validation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Source Validation Tester
        </CardTitle>
        <CardDescription>
          Test the enhanced RSS feed discovery functionality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter webpage or RSS feed URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testValidation()}
          />
          <Button 
            onClick={testValidation}
            disabled={loading}
          >
            {loading ? 'Testing...' : 'Test'}
          </Button>
        </div>

        {/* Quick test buttons */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Quick tests:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUrl('https://www.sussexexpress.co.uk/your-sussex/east-sussex/hastings-and-rye')}
            >
              Sussex Express (webpage)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUrl('https://www.theargus.co.uk/news/rss')}
            >
              The Argus (RSS)
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? 'Valid' : 'Invalid'}
              </Badge>
              {result.isAccessible && (
                <Badge variant="outline">Accessible</Badge>
              )}
              {result.isValidRSS && (
                <Badge variant="outline">RSS Feed</Badge>
              )}
            </div>

            {result.suggestedUrl && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-800 mb-1">
                  🎉 Auto-discovered RSS feed:
                </p>
                <div className="flex items-center justify-between">
                  <code className="text-sm text-green-700 bg-green-100 px-2 py-1 rounded">
                    {result.suggestedUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(result.suggestedUrl, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {result.articleCount !== undefined && (
              <p className="text-sm">
                <strong>Articles found:</strong> {result.articleCount}
              </p>
            )}

            {result.discoveredFeeds && result.discoveredFeeds.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Other discovered feeds:</p>
                <div className="space-y-1">
                  {result.discoveredFeeds.slice(0, 5).map((feed, index) => (
                    <div key={index} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
                      <code className="text-gray-700">{feed}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(feed, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Warnings:</p>
                <div className="space-y-1">
                  {result.warnings.map((warning, index) => (
                    <div key={index} className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.error && (
              <div className="text-sm text-red-700 bg-red-50 p-2 rounded">
                <strong>Error:</strong> {result.error}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};