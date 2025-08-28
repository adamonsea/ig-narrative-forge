import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit2, Save, X } from 'lucide-react';

interface FeedCTAConfig {
  id: string;
  topic_id: string | null;
  feed_name: string;
  engagement_question: string;
  show_like_share: boolean;
  attribution_cta: string | null;
  is_active: boolean;
}

export default function FeedCTAManager() {
  const [configs, setConfigs] = useState<FeedCTAConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    feed_name: '',
    engagement_question: 'What do you think?',
    show_like_share: true,
    attribution_cta: '',
    is_active: true,
    topic_id: null as string | null
  });
  const { toast } = useToast();

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('feed_cta_configs')
        .select('*')
        .is('topic_id', null) // Only show global/admin configs (no topic_id)
        .order('feed_name');

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('Error loading feed CTA configs:', error);
      toast({
        title: "Error",
        description: "Failed to load feed configurations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        attribution_cta: formData.attribution_cta.trim() || null,
        topic_id: null // Admin configs are always global (no topic_id)
      };

      let error;
      if (editingId) {
        const { error: updateError } = await supabase
          .from('feed_cta_configs')
          .update(payload)
          .eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('feed_cta_configs')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: "Success",
        description: `Feed configuration ${editingId ? 'updated' : 'created'} successfully`
      });

      setEditingId(null);
      setIsCreating(false);
      setFormData({
        feed_name: '',
        engagement_question: 'What do you think?',
        show_like_share: true,
        attribution_cta: '',
        is_active: true,
        topic_id: null
      });
      loadConfigs();
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive"
      });
    }
  };

  const startEdit = (config: FeedCTAConfig) => {
    setEditingId(config.id);
    setFormData({
      feed_name: config.feed_name,
      engagement_question: config.engagement_question,
      show_like_share: config.show_like_share,
      attribution_cta: config.attribution_cta || '',
      is_active: config.is_active,
      topic_id: config.topic_id
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({
      feed_name: '',
      engagement_question: 'What do you think?',
      show_like_share: true,
      attribution_cta: '',
      is_active: true,
      topic_id: null
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Global Feed CTA Configuration</h2>
          <p className="text-muted-foreground">
            Manage global call-to-action settings (admin only)
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating || !!editingId}>
          <Plus className="h-4 w-4 mr-2" />
          Add Feed Config
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit' : 'Create'} Feed Configuration</CardTitle>
            <CardDescription>
              Configure the CTA elements for this feed's stories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feed_name">Feed Name</Label>
              <Input
                id="feed_name"
                value={formData.feed_name}
                onChange={(e) => setFormData({ ...formData, feed_name: e.target.value })}
                placeholder="e.g., Eastbourne, Brighton"
                disabled={!!editingId}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="engagement_question">Engagement Question</Label>
              <Textarea
                id="engagement_question"
                value={formData.engagement_question}
                onChange={(e) => setFormData({ ...formData, engagement_question: e.target.value })}
                placeholder="e.g., What do you think about this?"
                className="min-h-[80px]"
              />
              <p className="text-sm text-muted-foreground">
                Use [topic] as a placeholder that will be replaced with the story topic
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="show_like_share"
                checked={Boolean(formData.show_like_share)}
                onCheckedChange={(checked) => setFormData({ ...formData, show_like_share: checked })}
              />
              <Label htmlFor="show_like_share">Show Like & Share CTA</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attribution_cta">Attribution CTA (Optional)</Label>
              <Input
                id="attribution_cta"
                value={formData.attribution_cta}
                onChange={(e) => setFormData({ ...formData, attribution_cta: e.target.value })}
                placeholder="e.g., Support local journalism"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={Boolean(formData.is_active)}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>How the final slide will appear</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium">
                {formData.engagement_question}
                {formData.show_like_share ? ' Like, share.' : ''}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Summary of a story by [Author] from [Publication].
                {formData.attribution_cta && ` ${formData.attribution_cta},`}
                {' '}visit <span className="text-primary font-bold underline">[domain]</span> for the full story.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Configs */}
      <div className="grid gap-4">
        {configs.map((config) => (
          <Card key={config.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {config.feed_name}
                    {!config.is_active && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                        Inactive
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>{config.engagement_question}</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => startEdit(config)}
                  disabled={isCreating || !!editingId}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p><strong>Like & Share:</strong> {config.show_like_share ? 'Enabled' : 'Disabled'}</p>
                {config.attribution_cta && (
                  <p><strong>Attribution CTA:</strong> {config.attribution_cta}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
