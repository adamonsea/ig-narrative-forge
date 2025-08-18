import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Search, Save, Filter, X, Calendar, Tag, Globe, BookOpen } from 'lucide-react';

interface SearchFilters {
  query: string;
  regions: string[];
  categories: string[];
  tags: string[];
  dateFrom: string;
  dateTo: string;
  wordCountMin: number;
  wordCountMax: number;
  credibilityMin: number;
  authors: string[];
}

interface SavedFilter {
  id: string;
  name: string;
  description: string | null;
  filters: SearchFilters;
  is_public: boolean;
}

interface AdvancedSearchProps {
  onSearchResults: (articles: any[]) => void;
}

export const AdvancedSearch = ({ onSearchResults }: AdvancedSearchProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    regions: [],
    categories: [],
    tags: [],
    dateFrom: '',
    dateTo: '',
    wordCountMin: 0,
    wordCountMax: 5000,
    credibilityMin: 0,
    authors: []
  });

  const [availableOptions, setAvailableOptions] = useState({
    regions: [] as string[],
    categories: [] as string[],
    tags: [] as string[],
    authors: [] as string[]
  });

  // Load saved filters and available options
  useEffect(() => {
    if (user) {
      loadSavedFilters();
      loadAvailableOptions();
    }
  }, [user]);

  const loadSavedFilters = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedFilters((data || []) as any);
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
  };

  const loadAvailableOptions = async () => {
    try {
      const { data: articles, error } = await supabase
        .from('articles')
        .select('region, category, tags, author')
        .not('region', 'is', null)
        .not('category', 'is', null)
        .not('author', 'is', null);

      if (error) throw error;

      const regions = [...new Set(articles?.map(a => a.region).filter(Boolean))] as string[];
      const categories = [...new Set(articles?.map(a => a.category).filter(Boolean))] as string[];
      const authors = [...new Set(articles?.map(a => a.author).filter(Boolean))] as string[];
      const tags = [...new Set(articles?.flatMap(a => a.tags || []).filter(Boolean))] as string[];

      setAvailableOptions({ regions, categories, tags, authors });
    } catch (error) {
      console.error('Error loading options:', error);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    const startTime = Date.now();

    try {
      let query = supabase
        .from('articles')
        .select(`
          *,
          content_sources!left (
            source_name,
            credibility_score
          )
        `);

      // Text search
      if (filters.query.trim()) {
        query = query.textSearch('search', filters.query.trim());
      }

      // Region filter
      if (filters.regions.length > 0) {
        query = query.in('region', filters.regions);
      }

      // Category filter
      if (filters.categories.length > 0) {
        query = query.in('category', filters.categories);
      }

      // Author filter
      if (filters.authors.length > 0) {
        query = query.in('author', filters.authors);
      }

      // Date range filter
      if (filters.dateFrom) {
        query = query.gte('published_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('published_at', filters.dateTo);
      }

      // Word count filter
      if (filters.wordCountMin > 0) {
        query = query.gte('word_count', filters.wordCountMin);
      }
      if (filters.wordCountMax < 5000) {
        query = query.lte('word_count', filters.wordCountMax);
      }

      query = query.order('published_at', { ascending: false }).limit(100);

      const { data, error } = await query;

      if (error) throw error;

      // Filter by tags (client-side since it's an array)
      let results = data || [];
      if (filters.tags.length > 0) {
        results = results.filter(article => 
          article.tags && 
          filters.tags.some(tag => article.tags.includes(tag))
        );
      }

      // Filter by credibility score (from joined source)
      if (filters.credibilityMin > 0) {
        results = results.filter(article => 
          article.content_sources && 
          (article.content_sources.credibility_score || 0) >= filters.credibilityMin
        );
      }

      onSearchResults(results);

      // Log search query
      const executionTime = Date.now() - startTime;
      await supabase
        .from('search_queries')
        .insert({
          query_text: filters.query || 'Advanced search',
          user_id: user?.id,
          results_count: results.length,
          execution_time_ms: executionTime,
          filters: filters as any
        });

      toast({
        title: 'Search Complete',
        description: `Found ${results.length} articles in ${executionTime}ms`,
      });

    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search Error',
        description: error.message || 'Failed to execute search',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFilter = async () => {
    if (!saveFilterName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a name for the filter',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('saved_filters')
        .insert({
          name: saveFilterName.trim(),
          filters: filters as any,
          user_id: user?.id,
          is_public: false
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Filter saved successfully',
      });

      setSaveFilterName('');
      setShowSaveDialog(false);
      loadSavedFilters();
    } catch (error) {
      console.error('Error saving filter:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save filter',
        variant: 'destructive',
      });
    }
  };

  const handleLoadFilter = (savedFilter: SavedFilter) => {
    setFilters(savedFilter.filters);
    toast({
      title: 'Filter Loaded',
      description: `Loaded filter: ${savedFilter.name}`,
    });
  };

  const clearFilters = () => {
    setFilters({
      query: '',
      regions: [],
      categories: [],
      tags: [],
      dateFrom: '',
      dateTo: '',
      wordCountMin: 0,
      wordCountMax: 5000,
      credibilityMin: 0,
      authors: []
    });
  };

  const handleArrayFilterChange = (
    filterKey: keyof Pick<SearchFilters, 'regions' | 'categories' | 'tags' | 'authors'>,
    value: string,
    checked: boolean
  ) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: checked
        ? [...prev[filterKey], value]
        : prev[filterKey].filter(item => item !== value)
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Search Filters */}
      <div className="lg:col-span-3 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Advanced Search Filters
            </CardTitle>
            <CardDescription>
              Use multiple criteria to find exactly the content you need
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Text Search */}
            <div>
              <Label htmlFor="search-query">Search Query</Label>
              <Input
                id="search-query"
                placeholder="Search titles, content, authors..."
                value={filters.query}
                onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date-from">Date From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="date-to">Date To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>
            </div>

            {/* Word Count Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="word-min">Min Words</Label>
                <Input
                  id="word-min"
                  type="number"
                  min="0"
                  value={filters.wordCountMin}
                  onChange={(e) => setFilters(prev => ({ ...prev, wordCountMin: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="word-max">Max Words</Label>
                <Input
                  id="word-max"
                  type="number"
                  min="0"
                  value={filters.wordCountMax}
                  onChange={(e) => setFilters(prev => ({ ...prev, wordCountMax: parseInt(e.target.value) || 5000 }))}
                />
              </div>
            </div>

            {/* Credibility Score */}
            <div>
              <Label htmlFor="credibility">Minimum Credibility Score</Label>
              <Input
                id="credibility"
                type="number"
                min="0"
                max="100"
                value={filters.credibilityMin}
                onChange={(e) => setFilters(prev => ({ ...prev, credibilityMin: parseInt(e.target.value) || 0 }))}
              />
            </div>

            {/* Multiple Choice Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Regions */}
              <div>
                <Label>Regions</Label>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                  {availableOptions.regions.map(region => (
                    <div key={region} className="flex items-center space-x-2">
                      <Checkbox
                        id={`region-${region}`}
                        checked={filters.regions.includes(region)}
                        onCheckedChange={(checked) => 
                          handleArrayFilterChange('regions', region, checked as boolean)
                        }
                      />
                      <Label htmlFor={`region-${region}`} className="text-sm">
                        {region}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <Label>Categories</Label>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                  {availableOptions.categories.map(category => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category}`}
                        checked={filters.categories.includes(category)}
                        onCheckedChange={(checked) => 
                          handleArrayFilterChange('categories', category, checked as boolean)
                        }
                      />
                      <Label htmlFor={`category-${category}`} className="text-sm">
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button onClick={handleSearch} disabled={loading}>
                <Search className="w-4 h-4 mr-2" />
                {loading ? 'Searching...' : 'Search'}
              </Button>
              <Button variant="outline" onClick={() => setShowSaveDialog(true)}>
                <Save className="w-4 h-4 mr-2" />
                Save Filter
              </Button>
              <Button variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>

            {/* Active Filters Display */}
            {(filters.regions.length > 0 || filters.categories.length > 0 || filters.tags.length > 0 || filters.authors.length > 0) && (
              <div className="space-y-2">
                <Label>Active Filters:</Label>
                <div className="flex flex-wrap gap-2">
                  {filters.regions.map(region => (
                    <Badge key={region} variant="secondary" className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {region}
                      <X 
                        className="w-3 h-3 cursor-pointer" 
                        onClick={() => handleArrayFilterChange('regions', region, false)}
                      />
                    </Badge>
                  ))}
                  {filters.categories.map(category => (
                    <Badge key={category} variant="outline" className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {category}
                      <X 
                        className="w-3 h-3 cursor-pointer" 
                        onClick={() => handleArrayFilterChange('categories', category, false)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Filter Dialog */}
        {showSaveDialog && (
          <Card>
            <CardHeader>
              <CardTitle>Save Search Filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="filter-name">Filter Name</Label>
                <Input
                  id="filter-name"
                  placeholder="e.g., Tech News This Week"
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveFilter}>Save</Button>
                <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Saved Filters Sidebar */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Saved Filters</CardTitle>
            <CardDescription>
              Quick access to your saved search criteria
            </CardDescription>
          </CardHeader>
          <CardContent>
            {savedFilters.length > 0 ? (
              <div className="space-y-2">
                {savedFilters.map(filter => (
                  <div
                    key={filter.id}
                    className="p-3 border rounded cursor-pointer hover:bg-accent"
                    onClick={() => handleLoadFilter(filter)}
                  >
                    <p className="font-medium text-sm">{filter.name}</p>
                    {filter.description && (
                      <p className="text-xs text-muted-foreground mt-1">{filter.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No saved filters yet. Create and save your first search filter to see it here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};