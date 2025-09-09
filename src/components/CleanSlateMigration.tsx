import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/integrations/supabase/client"

interface CleanupResult {
  topic_id: string
  success: boolean
  data?: any
  error?: string
}

export const CleanSlateMigration = () => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<{
    cleanup?: CleanupResult[]
    deletion?: CleanupResult[]
  }>({})

  // Mixed topics - clean content, keep topic configs
  const mixedTopics = [
    { id: 'ba443441-9f01-4116-8695-67ec08cba1df', name: 'Brighton' },
    { id: '45daedca-f64d-45c9-a103-8564671d16ea', name: 'Hastings news' },
    { id: 'c2d1b195-136a-4336-b64b-52c9c451e03d', name: 'Film for kids' },
    { id: 'c5bba557-e190-41c2-ae1e-2b3fb7db3892', name: 'Meditech' },
    { id: 'e6de0eaa-6884-41c5-9478-e369265e8a8f', name: 'Hastings and St Leonards' }
  ]

  // Empty topics - delete entirely
  const emptyTopics = [
    { id: '3df67661-8f8a-4bb0-9826-c02160a129e7', name: '2 star tv' },
    { id: 'c9e2fca1-78ab-48ae-8097-3b96b04403f6', name: 'bead-based cell analysis' },
    { id: '5f98ccd1-3d5c-4262-b9f5-fa0c75986d67', name: 'kubernetes' },
    { id: '3a65a60d-4bb8-46ec-82d7-9d59cce89ea5', name: 'medical device' },
    { id: '6828cc8c-48fa-4611-8c54-3ac0ab5d50b3', name: 'Patcham news' },
    { id: '9cda9a16-fa38-4ef3-9d5a-a111af7625ee', name: 'The global branding agency of the future' },
    { id: '3eb42c3b-46c5-4430-bf5d-109f5e119b13', name: 'up my street' },
    { id: '4db8103b-969a-4a31-8504-6a82f795b811', name: 'US House and Senate Bills' }
  ]

  const executeCleanup = async () => {
    setIsProcessing(true)
    try {
      // Step 1: Clean content from mixed topics
      console.log('🧹 Cleaning content from mixed topics...')
      const { data: cleanupData } = await supabase.functions.invoke('clean-slate-migration', {
        body: {
          action: 'cleanup_content',
          topic_ids: mixedTopics.map(t => t.id)
        }
      })

      // Step 2: Delete empty topics entirely
      console.log('🗑️ Deleting empty topics...')
      const { data: deletionData } = await supabase.functions.invoke('clean-slate-migration', {
        body: {
          action: 'delete_topics',
          topic_ids: emptyTopics.map(t => t.id)
        }
      })

      setResults({
        cleanup: cleanupData?.results || [],
        deletion: deletionData?.results || []
      })

      console.log('✅ Clean slate migration completed')
    } catch (error) {
      console.error('❌ Migration failed:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const renderResults = (results: CleanupResult[], type: 'cleanup' | 'deletion') => {
    if (!results.length) return null

    const topics = type === 'cleanup' ? mixedTopics : emptyTopics

    return (
      <div className="space-y-2">
        {results.map((result, index) => {
          const topic = topics.find(t => t.id === result.topic_id)
          return (
            <div key={result.topic_id} className="flex items-center justify-between p-2 border rounded">
              <span className="font-medium">{topic?.name || 'Unknown Topic'}</span>
              <div className="flex items-center gap-2">
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? "Success" : "Failed"}
                </Badge>
                {result.success && result.data && (
                  <span className="text-sm text-muted-foreground">
                    {type === 'cleanup' 
                      ? `Cleaned: ${result.data.deleted_counts?.legacy_articles + result.data.deleted_counts?.multi_tenant_articles || 0} articles`
                      : `Deleted: ${result.data.topic_name}`
                    }
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>🧹 Clean Slate Migration</CardTitle>
        <CardDescription>
          Clean up legacy content and prepare a fresh testing environment for the multi-tenant pipeline
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2">Mixed Topics (Clean Content)</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Keep topic configurations, delete all articles/stories/content
            </p>
            <div className="space-y-1">
              {mixedTopics.map(topic => (
                <div key={topic.id} className="text-sm p-2 bg-muted rounded">
                  {topic.name}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Empty Topics (Delete Entirely)</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Remove completely - no content, no value
            </p>
            <div className="space-y-1">
              {emptyTopics.map(topic => (
                <div key={topic.id} className="text-sm p-2 bg-muted rounded">
                  {topic.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-semibold mb-2">Preserved Topics</h3>
          <p className="text-sm text-muted-foreground mb-3">
            These working topics will remain untouched:
          </p>
          <div className="flex gap-2">
            <Badge variant="outline">Eastbourne (598 articles, 119 stories)</Badge>
            <Badge variant="outline">AI for Agency (392 articles, 77 stories)</Badge>
          </div>
        </div>

        <Separator />

        <Button 
          onClick={executeCleanup} 
          disabled={isProcessing}
          className="w-full"
          size="lg"
        >
          {isProcessing ? "🔄 Processing Migration..." : "🚀 Execute Clean Slate Migration"}
        </Button>

        {(results.cleanup || results.deletion) && (
          <div className="space-y-4 mt-6">
            {results.cleanup && (
              <div>
                <h4 className="font-semibold mb-2">Content Cleanup Results</h4>
                {renderResults(results.cleanup, 'cleanup')}
              </div>
            )}
            
            {results.deletion && (
              <div>
                <h4 className="font-semibold mb-2">Topic Deletion Results</h4>
                {renderResults(results.deletion, 'deletion')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
