import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Archive, Trash2 } from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/hooks/useAuth"

interface ArchiveResult {
  topic_id: string
  topic_name: string
  action: string
  success: boolean
}

export const CleanSlateMigration = () => {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<ArchiveResult[]>([])

  const executeArchive = async () => {
    if (!user) return
    
    setIsProcessing(true)
    try {
      console.log('📦 Archiving unused topics for current user...')
      
      const { data, error } = await supabase.rpc('bulk_cleanup_user_topics', {
        p_user_id: user.id,
        p_action: 'archive'
      })

      if (error) {
        console.error('❌ Archive failed:', error)
        return
      }

      setResults((data as any)?.results || [])
      console.log('✅ Archive completed:', data)
    } catch (error) {
      console.error('❌ Archive failed:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Topic Archive & Cleanup
        </CardTitle>
        <CardDescription>
          Archive your unused topics while preserving Eastbourne and AI for Agency. Other users' topics remain untouched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2 text-green-600">✅ Preserved Topics</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Your working topics will remain active
            </p>
            <div className="space-y-1">
              <div className="text-sm p-2 bg-green-50 border border-green-200 rounded">
                Eastbourne (Regional)
              </div>
              <div className="text-sm p-2 bg-green-50 border border-green-200 rounded">
                AI for Agency (Keyword)
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2 text-orange-600">📦 Will Be Archived</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Your other topics will be archived (can be restored later)
            </p>
            <div className="text-sm p-2 bg-orange-50 border border-orange-200 rounded">
              All your other topics will be moved to archive where you can manage them individually
            </div>
          </div>
        </div>

        <Separator />

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 mb-2">🔒 Safety Features</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Only affects topics you created</li>
            <li>• Other users' topics remain completely untouched</li>
            <li>• Archived topics can be restored from the Topic Manager</li>
            <li>• Your working topics (Eastbourne & AI for Agency) are protected</li>
          </ul>
        </div>

        <Button 
          onClick={executeArchive} 
          disabled={isProcessing || !user}
          className="w-full"
          size="lg"
        >
          {isProcessing ? "📦 Archiving Topics..." : "🚀 Archive Unused Topics"}
        </Button>

        {results.length > 0 && (
          <div className="space-y-2 mt-6">
            <h4 className="font-semibold">Archive Results</h4>
            {results.map((result, index) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded">
                <span className="font-medium">{result.topic_name}</span>
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? "Archived" : "Failed"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
