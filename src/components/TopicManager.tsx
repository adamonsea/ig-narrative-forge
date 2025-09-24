import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Settings, Users, BarChart3, MapPin, Hash, Trash2, MessageSquare, Clock, Archive, Info } from "lucide-react";
import { generateTopicGradient, generateAccentColor } from "@/lib/colorUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import TopicCTAManager from "@/components/topic/TopicCTAManager";
import { CreateTopicDialog } from "@/components/CreateTopicDialog";

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
  articles_in_arrivals?: number;
  stories_published_this_week?: number;
  _count?: {
    articles: number;
    sources: number;
  };
}

export const TopicManager = () => {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [managingCTAForTopic, setManagingCTAForTopic] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadTopics();
    }
  }, [user]);

  const loadTopics = async () => {
    try {
      // Only load active (non-archived) topics created by the current user
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .eq('created_by', user?.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion to ensure topic_type is correctly typed
      setTopics((data || []).map(topic => ({
        ...topic,
        topic_type: topic.topic_type as 'regional' | 'keyword',
        articles_in_arrivals: Math.floor(Math.random() * 15), // Mock data for now
        stories_published_this_week: Math.floor(Math.random() * 8)
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

  const handleTopicCreated = (topicSlug: string) => {
    toast({
      title: "Success!",
      description: "Topic created successfully! Redirecting to topic dashboard..."
    });
    loadTopics(); // Refresh the topics list
    navigate(`/dashboard/topic/${topicSlug}`);
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

  const handleArchiveTopic = async (topicId: string, topicName: string) => {
    if (!confirm(`Archive "${topicName}"? You can restore it later from the archive.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('topics')
        .update({ 
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user?.id
        })
        .eq('id', topicId);

      if (error) throw error;

      // Remove from current topics list
      setTopics(topics.filter(topic => topic.id !== topicId));

      toast({
        title: "Success",
        description: `"${topicName}" has been archived`
      });
    } catch (error) {
      console.error('Error archiving topic:', error);
      toast({
        title: "Error",
        description: "Failed to archive topic",
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
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Topic
        </Button>
      </div>

      <CreateTopicDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTopicCreated={handleTopicCreated}
      />

      {topics.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mb-4">
              <Hash className="w-16 h-16 mx-auto text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No topics yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first topic to start curating content feeds
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Topic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {topics.map((topic) => {
            const gradientClass = generateTopicGradient(topic.id);
            const accentClass = generateAccentColor(topic.id);
            
            return (
              <Card key={topic.id} className={`${gradientClass} border ${accentClass} relative overflow-hidden group hover:shadow-lg transition-all duration-300`}>
                <Link 
                  to={`/dashboard/topic/${topic.slug}`}
                  className="block"
                  onClick={(e) => {
                    // Let buttons handle their own clicks
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('[role="button"]')) {
                      e.preventDefault();
                    }
                  }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 pr-6">
                        <h3 className="text-2xl font-bold tracking-tight mb-2 group-hover:text-primary transition-colors">
                          {topic.name}
                        </h3>
                        <p className="text-base font-normal text-muted-foreground leading-relaxed">
                          {topic.description}
                        </p>
                      </div>
                      
                      {/* Stats Section */}
                      <div className="flex flex-col gap-3 min-w-[140px]">
                        <div className="bg-card/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
                          <div className="text-2xl font-bold text-foreground">
                            {topic.articles_in_arrivals || 0}
                          </div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Articles in arrivals
                          </div>
                        </div>
                        <div className="bg-card/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
                          <div className="text-2xl font-bold text-foreground">
                            {topic.stories_published_this_week || 0}
                          </div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Stories this week
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="flex items-center gap-1.5 bg-card/60 backdrop-blur-sm border-border/50">
                          {topic.topic_type === 'regional' ? <MapPin className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                          <span className="font-medium">{topic.topic_type === 'regional' ? 'Regional' : 'General'}</span>
                        </Badge>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Switch 
                                checked={topic.is_active} 
                                onCheckedChange={(checked) => toggleTopicStatus(topic.id, checked)}
                                onClick={(e) => e.preventDefault()}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{topic.is_active ? 'Published' : 'Draft'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {topic.keywords && topic.keywords.length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button 
                                  className="p-1 rounded-full hover:bg-card/60 transition-colors"
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <Info className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                  <p className="font-medium text-xs">Keywords:</p>
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
                        )}

                        <span className="text-xs font-medium text-muted-foreground">
                          {new Date(topic.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="bg-card/60 backdrop-blur-sm border-border/50 hover:bg-card/80"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Link to={`/feed/${topic.slug}`}>
                            Feed
                          </Link>
                        </Button>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-card/60 backdrop-blur-sm border-border/50 hover:bg-destructive/10 hover:text-destructive p-2"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleArchiveTopic(topic.id, topic.name);
                                }}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Archive this topic</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};