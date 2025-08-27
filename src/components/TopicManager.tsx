import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Settings, Users, BarChart3, Globe, MapPin, Hash, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

interface Topic {
  id: string;
  name: string;
  description: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  slug?: string;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  _count?: {
    articles: number;
    sources: number;
  };
}

export const TopicManager = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTopic, setNewTopic] = useState({
    name: '',
    description: '',
    topic_type: 'keyword' as 'regional' | 'keyword',
    keywords: '',
    region: '',
    landmarks: '',
    postcodes: '',
    organizations: '',
    is_public: false
  });
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Type assertion to ensure topic_type is correctly typed
      setTopics((data || []).map(topic => ({
        ...topic,
        topic_type: topic.topic_type as 'regional' | 'keyword'
      })));
    } catch (error) {
      console.error('Error loading topics:', error);
      toast({
        title: "Error",
        description: "Failed to load topics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopic.name.trim()) {
      toast({
        title: "Error",
        description: "Topic name is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const slug = newTopic.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const topicData = {
        name: newTopic.name,
        description: newTopic.description || null,
        topic_type: newTopic.topic_type,
        keywords: newTopic.keywords ? newTopic.keywords.split(',').map(k => k.trim()) : [],
        region: newTopic.topic_type === 'regional' ? newTopic.region : null,
        landmarks: newTopic.topic_type === 'regional' && newTopic.landmarks 
          ? newTopic.landmarks.split(',').map(k => k.trim()) : [],
        postcodes: newTopic.topic_type === 'regional' && newTopic.postcodes 
          ? newTopic.postcodes.split(',').map(k => k.trim()) : [],
        organizations: newTopic.topic_type === 'regional' && newTopic.organizations 
          ? newTopic.organizations.split(',').map(k => k.trim()) : [],
        slug,
        is_public: newTopic.is_public,
        created_by: user?.id
      };

      const { error } = await supabase
        .from('topics')
        .insert([topicData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Topic created successfully"
      });

      // Reset form and reload
      setNewTopic({
        name: '',
        description: '',
        topic_type: 'keyword',
        keywords: '',
        region: '',
        landmarks: '',
        postcodes: '',
        organizations: '',
        is_public: false
      });
      setShowCreateForm(false);
      loadTopics();

    } catch (error) {
      console.error('Error creating topic:', error);
      toast({
        title: "Error",
        description: "Failed to create topic",
        variant: "destructive"
      });
    }
  };

  const toggleTopicStatus = async (topicId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ is_active: isActive })
        .eq('id', topicId);

      if (error) throw error;

      setTopics(topics.map(topic => 
        topic.id === topicId ? { ...topic, is_active: isActive } : topic
      ));

      toast({
        title: "Success",
        description: `Topic ${isActive ? 'activated' : 'deactivated'}`
      });
    } catch (error) {
      console.error('Error updating topic:', error);
      toast({
        title: "Error",
        description: "Failed to update topic",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Your Topics</h2>
          <p className="text-muted-foreground">
            Manage your content topics and feeds
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Topic
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Topic</CardTitle>
            <CardDescription>
              Set up a new content topic for curated feeds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Topic Name *</Label>
                <Input
                  id="name"
                  value={newTopic.name}
                  onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
                  placeholder="e.g., AI & Technology, Local Events"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Topic Type</Label>
                <Select 
                  value={newTopic.topic_type} 
                  onValueChange={(value: 'regional' | 'keyword') => 
                    setNewTopic({ ...newTopic, topic_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">
                      <div className="flex items-center">
                        <Hash className="w-4 h-4 mr-2" />
                        General Topic (Keyword-based)
                      </div>
                    </SelectItem>
                    <SelectItem value="regional">
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 mr-2" />
                        Regional/Local News
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newTopic.description}
                onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                placeholder="Brief description of your topic focus..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={newTopic.keywords}
                onChange={(e) => setNewTopic({ ...newTopic, keywords: e.target.value })}
                placeholder="ai, technology, innovation (comma-separated)"
              />
            </div>

            {newTopic.topic_type === 'regional' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="region">Region Name</Label>
                  <Input
                    id="region"
                    value={newTopic.region}
                    onChange={(e) => setNewTopic({ ...newTopic, region: e.target.value })}
                    placeholder="e.g., Brighton, Manchester"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="postcodes">Postcodes</Label>
                  <Input
                    id="postcodes"
                    value={newTopic.postcodes}
                    onChange={(e) => setNewTopic({ ...newTopic, postcodes: e.target.value })}
                    placeholder="BN1, BN2, BN3 (comma-separated)"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="landmarks">Landmarks</Label>
                  <Input
                    id="landmarks"
                    value={newTopic.landmarks}
                    onChange={(e) => setNewTopic({ ...newTopic, landmarks: e.target.value })}
                    placeholder="Brighton Pier, Town Hall (comma-separated)"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="organizations">Organizations</Label>
                  <Input
                    id="organizations"
                    value={newTopic.organizations}
                    onChange={(e) => setNewTopic({ ...newTopic, organizations: e.target.value })}
                    placeholder="City Council, Local Police (comma-separated)"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="public"
                checked={newTopic.is_public}
                onCheckedChange={(checked) => setNewTopic({ ...newTopic, is_public: checked })}
              />
              <Label htmlFor="public">Make topic publicly visible</Label>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreateTopic}>Create Topic</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topics.map((topic) => (
          <Card key={topic.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {topic.topic_type === 'regional' ? (
                      <MapPin className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Hash className="w-4 h-4 text-green-500" />
                    )}
                    {topic.name}
                  </CardTitle>
                  {topic.description && (
                    <CardDescription className="mt-1">
                      {topic.description}
                    </CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {topic.is_public && (
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Switch
                    checked={topic.is_active}
                    onCheckedChange={(checked) => toggleTopicStatus(topic.id, checked)}
                  />
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {topic.keywords.slice(0, 3).map((keyword, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                  {topic.keywords.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{topic.keywords.length - 3} more
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Created {new Date(topic.created_at).toLocaleDateString()}</span>
                  <div className="flex gap-2">
                    {topic.slug && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/feed/topic/${topic.slug}`}>
                          View Feed
                        </Link>
                      </Button>
                    )}
                    <Button size="sm" variant="outline">
                      <Settings className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {topics.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">No topics yet</h3>
              <p className="text-muted-foreground">
                Create your first topic to start curating content
              </p>
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Topic
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};