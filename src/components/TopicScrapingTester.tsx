import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UniversalScrapingValidator } from './UniversalScrapingValidator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const testTopics = [
  { 
    id: 'd224e606-1a4c-4713-8135-1d30e2d6d0c6', 
    name: 'Eastbourne', 
    type: 'regional',
    description: 'Regional news for Eastbourne area'
  },
  { 
    id: 'e9064e24-9a87-4de8-8dca-8091ce26fb8a', 
    name: 'AI for Agency', 
    type: 'keyword',
    description: 'AI tools and solutions for marketing agencies'
  }
];

export function TopicScrapingTester() {
  const [activeTab, setActiveTab] = useState('eastbourne');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topic Scraping Test Suite</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="eastbourne" className="flex items-center gap-2">
              <Badge variant="secondary">Regional</Badge>
              Eastbourne
            </TabsTrigger>
            <TabsTrigger value="ai-agency" className="flex items-center gap-2">
              <Badge variant="outline">Keyword</Badge>
              AI for Agency
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="eastbourne">
            <UniversalScrapingValidator 
              topicId="d224e606-1a4c-4713-8135-1d30e2d6d0c6"
              topicName="Eastbourne (Regional)"
            />
          </TabsContent>
          
          <TabsContent value="ai-agency">
            <UniversalScrapingValidator 
              topicId="e9064e24-9a87-4de8-8dca-8091ce26fb8a"
              topicName="AI for Agency (Keyword)"
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}