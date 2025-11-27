import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UniversalScrapingValidator } from './UniversalScrapingValidator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

export function TopicScrapingTester() {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Fetch active topics dynamically (multi-tenant)
  const { data: topics, isLoading } = useQuery({
    queryKey: ['scraper-test-topics'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('topics')
        .select('id, name, slug, topic_type')
        .eq('is_active', true)
        .eq('is_archived', false)
        .eq('created_by', user.id)
        .order('name')
        .limit(10);

      if (error) {
        console.error('Failed to fetch topics:', error);
        return [];
      }
      return data || [];
    },
  });

  // Set initial tab when topics load
  React.useEffect(() => {
    if (topics && topics.length > 0 && !activeTab) {
      setActiveTab(topics[0].slug);
    }
  }, [topics, activeTab]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Topic Scraping Test Suite</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!topics || topics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Topic Scraping Test Suite</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No active topics found. Create a topic first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topic Scraping Test Suite</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab || topics[0].slug} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full grid-cols-${Math.min(topics.length, 4)}`}>
            {topics.slice(0, 4).map((topic) => (
              <TabsTrigger key={topic.slug} value={topic.slug} className="flex items-center gap-2">
                <Badge variant={topic.topic_type === 'regional' ? 'secondary' : 'outline'}>
                  {topic.topic_type === 'regional' ? 'Regional' : 'Keyword'}
                </Badge>
                <span className="truncate max-w-[100px]">{topic.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {topics.map((topic) => (
            <TabsContent key={topic.slug} value={topic.slug}>
              <UniversalScrapingValidator 
                topicId={topic.id}
                topicName={`${topic.name} (${topic.topic_type === 'regional' ? 'Regional' : 'Keyword'})`}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
