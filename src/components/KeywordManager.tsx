import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, X, Hash, MapPin, Building, Navigation, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getScraperFunction } from "@/lib/scraperUtils";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
}

interface KeywordManagerProps {
  topic: Topic;
  onTopicUpdate: (updatedTopic: Topic) => void;
}

export const KeywordManager: React.FC<KeywordManagerProps> = ({ topic, onTopicUpdate }) => {
  const [keywords, setKeywords] = useState(topic.keywords || []);
  const [landmarks, setLandmarks] = useState(topic.landmarks || []);
  const [postcodes, setPostcodes] = useState(topic.postcodes || []);
  const [organizations, setOrganizations] = useState(topic.organizations || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [newLandmark, setNewLandmark] = useState('');
  const [newPostcode, setNewPostcode] = useState('');
  const [newOrganization, setNewOrganization] = useState('');
  const [saving, setSaving] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const { toast } = useToast();

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const addLandmark = () => {
    if (newLandmark.trim() && !landmarks.includes(newLandmark.trim())) {
      setLandmarks([...landmarks, newLandmark.trim()]);
      setNewLandmark('');
    }
  };

  const removeLandmark = (index: number) => {
    setLandmarks(landmarks.filter((_, i) => i !== index));
  };

  const addPostcode = () => {
    if (newPostcode.trim() && !postcodes.includes(newPostcode.trim())) {
      setPostcodes([...postcodes, newPostcode.trim()]);
      setNewPostcode('');
    }
  };

  const removePostcode = (index: number) => {
    setPostcodes(postcodes.filter((_, i) => i !== index));
  };

  const addOrganization = () => {
    if (newOrganization.trim() && !organizations.includes(newOrganization.trim())) {
      setOrganizations([...organizations, newOrganization.trim()]);
      setNewOrganization('');
    }
  };

  const removeOrganization = (index: number) => {
    setOrganizations(organizations.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData: any = {
        keywords,
        updated_at: new Date().toISOString()
      };

      if (topic.topic_type === 'regional') {
        updateData.landmarks = landmarks;
        updateData.postcodes = postcodes;
        updateData.organizations = organizations;
      }

      const { error } = await supabase
        .from('topics')
        .update(updateData)
        .eq('id', topic.id);

      if (error) throw error;

      const updatedTopic = {
        ...topic,
        keywords,
        landmarks: topic.topic_type === 'regional' ? landmarks : topic.landmarks,
        postcodes: topic.topic_type === 'regional' ? postcodes : topic.postcodes,
        organizations: topic.topic_type === 'regional' ? organizations : topic.organizations,
      };

      onTopicUpdate(updatedTopic);

      toast({
        title: "Success",
        description: "Topic keywords updated successfully",
      });
    } catch (error) {
      console.error('Error updating topic keywords:', error);
      toast({
        title: "Error",
        description: "Failed to update topic keywords",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRescore = async () => {
    setRescoring(true);
    try {
      const { error } = await supabase.rpc('rescore_articles_for_topic', {
        p_topic_id: topic.id
      });

      if (error) throw error;

      // Trigger re-scraping with updated keywords using appropriate scraper
      const { error: rescrapError } = await supabase.functions.invoke('keyword-rescan-trigger', {
        body: {
          topicId: topic.id,
          triggerType: 'keyword_update'
        }
      });

      if (rescrapError) {
        console.warn('Re-scraping trigger failed:', rescrapError);
      }

      toast({
        title: "Success",
        description: "Articles rescored and sources triggered for re-scanning",
      });
    } catch (error) {
      console.error('Error rescoring articles:', error);
      toast({
        title: "Error",
        description: "Failed to rescore articles",
        variant: "destructive"
      });
    } finally {
      setRescoring(false);
    }
  };

  const hasChanges = () => {
    return (
      JSON.stringify(keywords) !== JSON.stringify(topic.keywords) ||
      (topic.topic_type === 'regional' && (
        JSON.stringify(landmarks) !== JSON.stringify(topic.landmarks || []) ||
        JSON.stringify(postcodes) !== JSON.stringify(topic.postcodes || []) ||
        JSON.stringify(organizations) !== JSON.stringify(topic.organizations || [])
      ))
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Keyword Management
          </CardTitle>
          <CardDescription>
            Update keywords to refine content relevance for "{topic.name}"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Keywords */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {topic.topic_type === 'keyword' ? 'Topic Keywords' : 'Content Keywords'}
            </Label>
            <div className="flex gap-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add new keyword..."
                onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
              />
              <Button onClick={addKeyword} size="sm" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {keyword}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeKeyword(index)}
                    className="h-auto p-0 ml-1"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Regional-specific fields */}
          {topic.topic_type === 'regional' && (
            <>
              <Separator />
              
              {/* Landmarks */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Landmarks & Places
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newLandmark}
                    onChange={(e) => setNewLandmark(e.target.value)}
                    placeholder="Add landmark or place..."
                    onKeyPress={(e) => e.key === 'Enter' && addLandmark()}
                  />
                  <Button onClick={addLandmark} size="sm" variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {landmarks.map((landmark, index) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {landmark}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLandmark(index)}
                        className="h-auto p-0 ml-1"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Postcodes */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Navigation className="h-4 w-4" />
                  Postcodes
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newPostcode}
                    onChange={(e) => setNewPostcode(e.target.value)}
                    placeholder="Add postcode..."
                    onKeyPress={(e) => e.key === 'Enter' && addPostcode()}
                  />
                  <Button onClick={addPostcode} size="sm" variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {postcodes.map((postcode, index) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {postcode}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removePostcode(index)}
                        className="h-auto p-0 ml-1"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Organizations */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Organizations & Institutions
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newOrganization}
                    onChange={(e) => setNewOrganization(e.target.value)}
                    placeholder="Add organization..."
                    onKeyPress={(e) => e.key === 'Enter' && addOrganization()}
                  />
                  <Button onClick={addOrganization} size="sm" variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {organizations.map((org, index) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {org}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeOrganization(index)}
                        className="h-auto p-0 ml-1"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex gap-2 justify-between">
            <Button
              onClick={handleRescore}
              disabled={rescoring || !hasChanges()}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RotateCcw className={`h-4 w-4 ${rescoring ? 'animate-spin' : ''}`} />
              {rescoring ? 'Rescoring...' : 'Rescore Articles'}
            </Button>
            
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges()}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>

          {hasChanges() && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p className="font-medium mb-1">💡 After saving:</p>
              <ul className="text-xs space-y-1">
                <li>• Existing articles will be re-scored for relevance</li>
                <li>• Sources will be triggered for re-scanning with new keywords</li>
                <li>• Previously discarded articles may become relevant again</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};