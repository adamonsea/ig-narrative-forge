import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Rss, Link, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface ImportResult {
  success: boolean;
  articlesScraped: number;
  duplicatesFound: number;
  errors: string[];
}

interface ArticleImportProps {
  onImportComplete: () => void;
}

export const ArticleImport = ({ onImportComplete }: ArticleImportProps) => {
  const { toast } = useToast();
  const [importType, setImportType] = useState<'rss' | 'manual' | 'url'>('rss');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  
  // RSS Import Form
  const [rssUrl, setRssUrl] = useState('');
  const [region, setRegion] = useState('general');
  
  // Manual Article Form
  const [manualArticle, setManualArticle] = useState({
    title: '',
    body: '',
    author: '',
    source_url: '',
    category: '',
    tags: '',
  });

  // URL Import Form
  const [articleUrl, setArticleUrl] = useState('');

  const handleRssImport = async () => {
    if (!rssUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a valid RSS feed URL',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setProgress(10);
    setImportResult(null);

    try {
      // First, create or find content source
      setProgress(30);
      const { data: source, error: sourceError } = await supabase
        .from('content_sources')
        .upsert({
          source_name: extractDomainFromUrl(rssUrl),
          feed_url: rssUrl,
          region,
          canonical_domain: extractDomainFromUrl(rssUrl),
          is_active: true,
        }, {
          onConflict: 'canonical_domain'
        })
        .select()
        .single();

      if (sourceError) throw sourceError;

      setProgress(60);

      // Call RSS scraper function
      const { data, error } = await supabase.functions.invoke('rss-scraper', {
        body: {
          feedUrl: rssUrl,
          sourceId: source.id,
          region,
        },
      });

      if (error) throw error;

      setProgress(100);
      setImportResult(data);

      toast({
        title: 'RSS Import Complete',
        description: `Successfully imported ${data.articlesScraped} articles, found ${data.duplicatesFound} duplicates`,
      });

      onImportComplete();
    } catch (error) {
      console.error('RSS import error:', error);
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import RSS feed',
        variant: 'destructive',
      });
      setImportResult({
        success: false,
        articlesScraped: 0,
        duplicatesFound: 0,
        errors: [error.message || 'Unknown error'],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualImport = async () => {
    const { title, body, author, source_url, category, tags } = manualArticle;

    if (!title.trim() || !body.trim()) {
      toast({
        title: 'Error',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setProgress(50);

    try {
      const { error } = await supabase
        .from('articles')
        .insert({
          title: title.trim(),
          body: body.trim(),
          author: author.trim() || null,
          source_url: source_url.trim() || `manual-${Date.now()}`,
          canonical_url: source_url.trim() || null,
          region,
          category: category.trim() || null,
          tags: tags.trim() ? tags.split(',').map(t => t.trim()) : null,
          published_at: new Date().toISOString(),
          import_metadata: {
            imported_from: 'manual',
            imported_at: new Date().toISOString()
          }
        });

      if (error) throw error;

      setProgress(100);
      
      toast({
        title: 'Article Added',
        description: 'Article has been successfully added to the database',
      });

      // Reset form
      setManualArticle({
        title: '',
        body: '',
        author: '',
        source_url: '',
        category: '',
        tags: '',
      });

      onImportComplete();
    } catch (error) {
      console.error('Manual import error:', error);
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to add article',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const extractDomainFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown-source';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Import Methods */}
      <div className="lg:col-span-2 space-y-6">
        {/* RSS Feed Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rss className="w-5 h-5" />
              RSS Feed Import
            </CardTitle>
            <CardDescription>
              Import articles from RSS/Atom feeds with automatic deduplication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rss-url">RSS Feed URL</Label>
                <Input
                  id="rss-url"
                  placeholder="https://example.com/feed.xml"
                  value={rssUrl}
                  onChange={(e) => setRssUrl(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="region">Region</Label>
                <Select value={region} onValueChange={setRegion} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {loading && <Progress value={progress} />}
            
            <Button 
              onClick={handleRssImport} 
              disabled={loading || !rssUrl.trim()}
              className="w-full"
            >
              {loading ? 'Importing...' : 'Import RSS Feed'}
            </Button>
          </CardContent>
        </Card>

        {/* Manual Article Entry */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Manual Article Entry
            </CardTitle>
            <CardDescription>
              Add articles manually when RSS feeds are not available
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="Article title"
                  value={manualArticle.title}
                  onChange={(e) => setManualArticle(prev => ({ ...prev, title: e.target.value }))}
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="author">Author</Label>
                <Input
                  id="author"
                  placeholder="Article author"
                  value={manualArticle.author}
                  onChange={(e) => setManualArticle(prev => ({ ...prev, author: e.target.value }))}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="body">Content *</Label>
              <Textarea
                id="body"
                placeholder="Article content..."
                rows={6}
                value={manualArticle.body}
                onChange={(e) => setManualArticle(prev => ({ ...prev, body: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="source-url">Source URL</Label>
                <Input
                  id="source-url"
                  placeholder="https://..."
                  value={manualArticle.source_url}
                  onChange={(e) => setManualArticle(prev => ({ ...prev, source_url: e.target.value }))}
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g., Politics, Sports"
                  value={manualArticle.category}
                  onChange={(e) => setManualArticle(prev => ({ ...prev, category: e.target.value }))}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="tag1, tag2, tag3"
                value={manualArticle.tags}
                onChange={(e) => setManualArticle(prev => ({ ...prev, tags: e.target.value }))}
                disabled={loading}
              />
            </div>

            {loading && <Progress value={progress} />}

            <Button 
              onClick={handleManualImport}
              disabled={loading || !manualArticle.title.trim() || !manualArticle.body.trim()}
              className="w-full"
            >
              {loading ? 'Adding...' : 'Add Article'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Import Results & Help */}
      <div className="space-y-6">
        {/* Import Results */}
        {importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {importResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                )}
                Import Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span>Articles Imported:</span>
                <Badge variant="secondary">{importResult.articlesScraped}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Duplicates Found:</span>
                <Badge variant="outline">{importResult.duplicatesFound}</Badge>
              </div>
              {importResult.errors.length > 0 && (
                <div>
                  <Label className="text-sm font-medium text-red-600">Errors:</Label>
                  <ul className="text-sm text-red-600 mt-1">
                    {importResult.errors.slice(0, 3).map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                    {importResult.errors.length > 3 && (
                      <li>• ... and {importResult.errors.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Help & Tips */}
        <Card>
          <CardHeader>
            <CardTitle>Import Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong>RSS Feeds:</strong> Most news sites provide RSS feeds. 
              Look for links ending in .xml, .rss, or /feed/
            </div>
            <div>
              <strong>Deduplication:</strong> The system automatically detects 
              and skips duplicate articles using content checksums
            </div>
            <div>
              <strong>Manual Entry:</strong> Use this for articles from sources 
              without RSS feeds or for curated content
            </div>
            <div>
              <strong>Tags:</strong> Use comma-separated tags to help with 
              content organization and search
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};