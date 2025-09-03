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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Settings, Users, BarChart3, MapPin, Hash, Trash2, MessageSquare, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import TopicCTAManager from "@/components/topic/TopicCTAManager";
import { SourceSuggestionTool } from "@/components/SourceSuggestionTool";
import { KeywordSuggestionTool } from "@/components/KeywordSuggestionTool";

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
  audience_expertise?: 'beginner' | 'intermediate' | 'expert';
  default_tone?: 'formal' | 'conversational' | 'engaging';
  _count?: {
    articles: number;
    sources: number;
  };
}

export const TopicManager = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [managingCTAForTopic, setManagingCTAForTopic] = useState<{ id: string; name: string } | null>(null);
  const [newTopic, setNewTopic] = useState({
    name: '',
    description: '',
    topic_type: 'keyword' as 'regional' | 'keyword',
    keywords: '',
    region: '',
    landmarks: '',
    postcodes: '',
    organizations: '',
    is_public: false,
    audience_expertise: 'intermediate' as 'beginner' | 'intermediate' | 'expert',
    default_tone: 'conversational' as 'formal' | 'conversational' | 'engaging'
  });
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadTopics();
    }
  }, [user]);

  const loadTopics = async () => {
    try {
      // Only load topics created by the current user (admin dashboard shows owned topics only)
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .eq('created_by', user?.id)
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
        is_active: newTopic.is_public, // Use is_public from form to set initial is_active state
        created_by: user?.id,
        audience_expertise: newTopic.audience_expertise,
        default_tone: newTopic.default_tone
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
        is_public: false,
        audience_expertise: 'intermediate',
        default_tone: 'conversational'
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
        description: `Topic ${isActive ? 'published' : 'moved to draft'}`
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

  // If managing CTA for a topic, show the CTA manager
  if (managingCTAForTopic) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setManagingCTAForTopic(null)}>
            ← Back to Topics
          </Button>
        </div>
        <TopicCTAManager 
          topicId={managingCTAForTopic.id}
          topicName={managingCTAForTopic.name}
          onClose={() => setManagingCTAForTopic(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
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

            {/* Audience Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/10 dark:to-purple-950/10">
              <div className="space-y-2">
                <Label htmlFor="audience_expertise">
                  Audience Expertise Level
                  <span className="text-xs text-muted-foreground block">Set once during topic creation</span>
                </Label>
                <Select 
                  value={newTopic.audience_expertise} 
                  onValueChange={(value: 'beginner' | 'intermediate' | 'expert') => 
                    setNewTopic({ ...newTopic, audience_expertise: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">
                      <div>
                        <div className="font-medium">Beginner</div>
                        <div className="text-xs text-muted-foreground">Clear explanations, more context</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="intermediate">
                      <div>
                        <div className="font-medium">Intermediate</div>
                        <div className="text-xs text-muted-foreground">Balanced technical depth</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="expert">
                      <div>
                        <div className="font-medium">Expert</div>
                        <div className="text-xs text-muted-foreground">Technical terminology, advanced insights</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="default_tone">
                  Default Tone
                  <span className="text-xs text-muted-foreground block">Can be overridden per article</span>
                </Label>
                <Select 
                  value={newTopic.default_tone} 
                  onValueChange={(value: 'formal' | 'conversational' | 'engaging') => 
                    setNewTopic({ ...newTopic, default_tone: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">
                      <div>
                        <div className="font-medium">Formal</div>
                        <div className="text-xs text-muted-foreground">Professional, authoritative</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="conversational">
                      <div>
                        <div className="font-medium">Conversational</div>
                        <div className="text-xs text-muted-foreground">Accessible, friendly</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="engaging">
                      <div>
                        <div className="font-medium">Engaging</div>
                        <div className="text-xs text-muted-foreground">Dynamic, compelling</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <KeywordSuggestionTool
              topicName={newTopic.name}
              description={newTopic.description}
              keywords={newTopic.keywords ? newTopic.keywords.split(',').map(k => k.trim()) : []}
              topicType={newTopic.topic_type}
              region={newTopic.region}
              onKeywordAdd={(keyword) => {
                const existingKeywords = newTopic.keywords ? newTopic.keywords.split(',').map(k => k.trim()) : [];
                const updatedKeywords = [...existingKeywords, keyword].join(', ');
                setNewTopic({ ...newTopic, keywords: updatedKeywords });
              }}
              existingKeywords={newTopic.keywords ? newTopic.keywords.split(',').map(k => k.trim()) : []}
            />

            <SourceSuggestionTool
              topicName={newTopic.name}
              description={newTopic.description}
              keywords={newTopic.keywords}
              topicType={newTopic.topic_type}
              region={newTopic.region}
            />

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
                id="published"
                checked={newTopic.is_public}
                onCheckedChange={(checked) => setNewTopic({ ...newTopic, is_public: checked })}
              />
              <Label htmlFor="published">Publish topic (make feed visible to public)</Label>
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

      <div className="space-y-6">
        {topics.map((topic) => {
          // Generate consistent gradients based on topic ID (same method as TopicDashboard)
          const getTopicGradient = (topicId: string) => {
            const gradients = [
              'from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20',
              'from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20',
              'from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20',
              'from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20',
              'from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20',
              'from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20',
              'from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20',
              'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20',
            ];
            
            // Use topic ID to consistently select the same gradient
            const hash = topicId.split('').reduce((a, b) => {
              a = ((a << 5) - a) + b.charCodeAt(0);
              return a & a;
            }, 0);
            
            return gradients[Math.abs(hash) % gradients.length];
          };

          const gradientClass = getTopicGradient(topic.id);

          return (
            <Card 
              key={topic.id} 
              className={`group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-border bg-gradient-to-br ${gradientClass} hover:scale-[1.01] cursor-pointer overflow-hidden relative`}
            >
              <Link 
                to={`/dashboard/topic/${topic.slug}`}
                className="absolute inset-0 z-10"
              />
              <CardContent className="p-8 relative">
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3">
                        {topic.topic_type === 'regional' ? (
                          <div className="p-2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            <MapPin className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="p-2 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                            <Hash className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <h3 className="text-xl font-semibold tracking-tight">{topic.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={topic.is_active ? "default" : "secondary"} className="text-xs">
                              {topic.is_active ? "Published" : "Draft"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 relative z-20">
                        {topic.slug && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            asChild 
                            className="hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            <Link to={`/feed/topic/${topic.slug}`}>
                              View Feed
                            </Link>
                          </Button>
                        )}
                        <Switch
                          checked={topic.is_active}
                          onCheckedChange={(checked) => toggleTopicStatus(topic.id, checked)}
                        />
                      </div>
                    </div>

                    {topic.description && (
                      <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
                        {topic.description}
                      </p>
                    )}

                     <div className="flex items-center gap-2">
                       <TooltipProvider>
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <div className="flex flex-wrap gap-2 cursor-help">
                               <Badge variant="outline" className="text-xs">
                                 <Hash className="w-3 h-3 mr-1" />
                                 {topic.keywords.length} Keywords
                               </Badge>
                             </div>
                           </TooltipTrigger>
                           <TooltipContent className="max-w-md">
                             <div className="space-y-1">
                               <p className="font-medium">Keywords:</p>
                               <div className="flex flex-wrap gap-1">
                                 {topic.keywords.map((keyword, index) => (
                                   <Badge key={index} variant="secondary" className="text-xs">
                                     {keyword}
                                   </Badge>
                                 ))}
                               </div>
                             </div>
                           </TooltipContent>
                         </Tooltip>
                       </TooltipProvider>

                       <TooltipProvider>
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <Badge variant="outline" className="cursor-help text-xs">
                               <Clock className="w-3 h-3 mr-1" />
                               Created
                             </Badge>
                           </TooltipTrigger>
                           <TooltipContent>
                             <p>Created: {new Date(topic.created_at).toLocaleDateString()}</p>
                           </TooltipContent>
                         </Tooltip>
                       </TooltipProvider>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

    </div>
  );
};