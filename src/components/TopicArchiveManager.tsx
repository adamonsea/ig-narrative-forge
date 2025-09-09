import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Archive, ArchiveRestore, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface Topic {
  id: string
  name: string
  topic_type: string
  region?: string
  is_archived: boolean
  archived_at?: string
  created_at: string
  article_count?: number
  story_count?: number
}

export const TopicArchiveManager = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const [activeTopics, setActiveTopics] = useState<Topic[]>([])
  const [archivedTopics, setArchivedTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const loadTopics = async () => {
    if (!user) return

    try {
      // Load active topics
      const { data: active, error: activeError } = await supabase
        .from('topics')
        .select(`
          id, name, topic_type, region, is_archived, archived_at, created_at,
          articles:articles(count),
          stories:stories(count)
        `)
        .eq('created_by', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (activeError) throw activeError

      // Load archived topics
      const { data: archived, error: archivedError } = await supabase
        .from('topics')
        .select(`
          id, name, topic_type, region, is_archived, archived_at, created_at,
          articles:articles(count),
          stories:stories(count)
        `)
        .eq('created_by', user.id)
        .eq('is_archived', true)
        .order('archived_at', { ascending: false })

      if (archivedError) throw archivedError

      setActiveTopics(active || [])
      setArchivedTopics(archived || [])
    } catch (error) {
      console.error('Error loading topics:', error)
      toast({
        title: "Error",
        description: "Failed to load topics",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const archiveTopic = async (topicId: string) => {
    if (!user) return

    setProcessing(topicId)
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id
        })
        .eq('id', topicId)
        .eq('created_by', user.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Topic archived successfully"
      })

      loadTopics()
    } catch (error) {
      console.error('Error archiving topic:', error)
      toast({
        title: "Error",
        description: "Failed to archive topic",
        variant: "destructive"
      })
    } finally {
      setProcessing(null)
    }
  }

  const restoreTopic = async (topicId: string) => {
    if (!user) return

    setProcessing(topicId)
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null
        })
        .eq('id', topicId)
        .eq('created_by', user.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Topic restored successfully"
      })

      loadTopics()
    } catch (error) {
      console.error('Error restoring topic:', error)
      toast({
        title: "Error",
        description: "Failed to restore topic",
        variant: "destructive"
      })
    } finally {
      setProcessing(null)
    }
  }

  const deleteTopic = async (topicId: string) => {
    if (!user) return

    setProcessing(topicId)
    try {
      const { data, error } = await supabase.rpc('delete_topic_cascade', {
        p_topic_id: topicId
      })

      if (error) throw error

      toast({
        title: "Success",
        description: "Topic permanently deleted"
      })

      loadTopics()
    } catch (error) {
      console.error('Error deleting topic:', error)
      toast({
        title: "Error",
        description: "Failed to delete topic",
        variant: "destructive"
      })
    } finally {
      setProcessing(null)
    }
  }

  useEffect(() => {
    loadTopics()
  }, [user])

  const renderTopicCard = (topic: Topic, isArchived: boolean) => (
    <Card key={topic.id} className={isArchived ? "opacity-75" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{topic.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={topic.topic_type === 'regional' ? 'default' : 'secondary'}>
              {topic.topic_type}
            </Badge>
            {topic.region && (
              <Badge variant="outline">{topic.region}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {topic.article_count || 0} articles • {topic.story_count || 0} stories
            {isArchived && topic.archived_at && (
              <div className="mt-1">
                Archived: {new Date(topic.archived_at).toLocaleDateString()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isArchived ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => archiveTopic(topic.id)}
                disabled={processing === topic.id}
              >
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreTopic(topic.id)}
                  disabled={processing === topic.id}
                >
                  <ArchiveRestore className="h-4 w-4 mr-1" />
                  Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={processing === topic.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Forever
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Delete Topic Forever?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{topic.name}" and all its associated content including articles, stories, and slides. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteTopic(topic.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Forever
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Topic Archive Manager
        </CardTitle>
        <CardDescription>
          Manage your active and archived topics. Archive topics to hide them from the main dashboard, or permanently delete archived topics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">
              Active Topics ({activeTopics.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived Topics ({archivedTopics.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="active" className="mt-6">
            {activeTopics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No active topics found
              </div>
            ) : (
              <div className="space-y-4">
                {activeTopics.map(topic => renderTopicCard(topic, false))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="archived" className="mt-6">
            {archivedTopics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No archived topics found
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-yellow-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Archived Topics</span>
                  </div>
                  <p className="text-sm text-yellow-700 mt-1">
                    These topics are hidden from your main dashboard but can be restored. Use "Delete Forever" to permanently remove them.
                  </p>
                </div>
                {archivedTopics.map(topic => renderTopicCard(topic, true))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}