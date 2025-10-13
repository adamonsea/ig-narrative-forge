/**
 * ARCHIVED: 2025-10-13
 * 
 * This component was retired because AI content generation is already producing
 * high-quality CTAs organically without manual configuration. The added complexity
 * of manual CTA management was deemed premature for current user needs.
 * 
 * See RETIRED_FEATURES.md for:
 * - Why this was built
 * - Why it was retired
 * - How to re-enable if needed
 * - Database schema (feed_cta_configs table still exists)
 * 
 * This code is preserved for potential future use when multi-curator workflows
 * or advanced personalization features might warrant manual CTA control.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, MessageSquare } from 'lucide-react';

interface FeedCTAConfig {
  id: string;
  topic_id: string;
  feed_name: string;
  engagement_question: string;
  show_like_share: boolean;
  attribution_cta: string | null;
  is_active: boolean;
}

interface TopicCTAManagerProps {
  topicId: string;
  topicName: string;
  onClose: () => void;
}

export default function TopicCTAManager({ topicId, topicName, onClose }: TopicCTAManagerProps) {
  const [config, setConfig] = useState<FeedCTAConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    engagement_question: 'What do you think about this?',
    show_like_share: true,
    attribution_cta: '',
    is_active: true
  });
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, [topicId]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('feed_cta_configs')
        .select('*')
        .eq('topic_id', topicId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setConfig(data);
        setFormData({
          engagement_question: data.engagement_question,
          show_like_share: data.show_like_share,
          attribution_cta: data.attribution_cta || '',
          is_active: data.is_active
        });
      } else {
        // No config exists yet, use defaults
        setConfig(null);
      }
    } catch (error) {
      console.error('Error loading topic CTA config:', error);
      toast({
        title: "Error",
        description: "Failed to load CTA configuration",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        topic_id: topicId,
        feed_name: topicName,
        engagement_question: formData.engagement_question,
        show_like_share: formData.show_like_share,
        attribution_cta: formData.attribution_cta.trim() || null,
        is_active: formData.is_active
      };

      let error;
      if (config) {
        // Update existing config
        const { error: updateError } = await supabase
          .from('feed_cta_configs')
          .update(payload)
          .eq('id', config.id);
        error = updateError;
      } else {
        // Create new config
        const { error: insertError } = await supabase
          .from('feed_cta_configs')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: "Success",
        description: `Feed CTA configuration ${config ? 'updated' : 'created'} successfully`
      });

      onClose();
    } catch (error) {
      console.error('Error saving CTA config:', error);
      toast({
        title: "Error",
        description: "Failed to save CTA configuration",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Feed CTA Configuration
              </CardTitle>
              <CardDescription>
                Configure how your "{topicName}" feed engages with readers
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="engagement_question">Engagement Question</Label>
            <Textarea
              id="engagement_question"
              value={formData.engagement_question}
              onChange={(e) => setFormData({ ...formData, engagement_question: e.target.value })}
              placeholder="e.g., What are your thoughts on this?"
              className="min-h-[80px]"
            />
            <p className="text-sm text-muted-foreground">
              This question will appear at the end of each story to encourage engagement
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="show_like_share"
              checked={Boolean(formData.show_like_share)}
              onCheckedChange={(checked) => setFormData({ ...formData, show_like_share: checked })}
            />
            <Label htmlFor="show_like_share">Show "Like & Share" CTA</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attribution_cta">Attribution CTA (Optional)</Label>
            <Input
              id="attribution_cta"
              value={formData.attribution_cta}
              onChange={(e) => setFormData({ ...formData, attribution_cta: e.target.value })}
              placeholder="e.g., Support local journalism"
            />
            <p className="text-sm text-muted-foreground">
              Additional call-to-action text to support the original publication
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={Boolean(formData.is_active)}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Enable CTA for this topic</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {config ? 'Update' : 'Create'} Configuration
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>How the final slide will appear to readers</CardDescription>
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
    </div>
  );
}
