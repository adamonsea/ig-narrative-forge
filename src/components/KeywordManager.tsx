import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, X, Hash, MapPin, Building, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { KeywordSuggestionTool } from "./KeywordSuggestionTool";
import { RegionalElementsSuggestionTool } from "./RegionalElementsSuggestionTool";
import { RegionalKeywordAutoPopulate } from "./RegionalKeywordAutoPopulate";

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
  const { toast } = useToast();

  // Update local state when topic prop changes
  useEffect(() => {
    const sortedKeywords = [...(topic.keywords || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    setKeywords(sortedKeywords);
    setLandmarks(topic.landmarks || []);
    setPostcodes(topic.postcodes || []);
    setOrganizations(topic.organizations || []);
  }, [topic]);

  // Listen for external keyword additions
  useEffect(() => {
    const handleKeywordAdded = () => {
      // Refresh from topic prop - parent will have updated it
      const sortedKeywords = [...(topic.keywords || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      setKeywords(sortedKeywords);
    };
    
    window.addEventListener('keywordAdded', handleKeywordAdded);
    return () => window.removeEventListener('keywordAdded', handleKeywordAdded);
  }, [topic]);

  const addKeyword = async (keywordToAdd?: string) => {
    const keywordValue = keywordToAdd || newKeyword.trim();
    if (keywordValue && !keywords.includes(keywordValue)) {
      const newKeywords = [...keywords, keywordValue].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      setKeywords(newKeywords);
      if (!keywordToAdd) setNewKeyword(''); // Only clear input if manually typed
      
      // Auto-save keyword immediately
      setSaving(true);
      try {
        const { error } = await supabase
          .from('topics')
          .update({ 
            keywords: newKeywords,
            updated_at: new Date().toISOString()
          })
          .eq('id', topic.id);

        if (error) throw error;

        const updatedTopic = {
          ...topic,
          keywords: newKeywords
        };
        onTopicUpdate(updatedTopic);
        
        // Trigger immediate re-scoring
        await supabase.rpc('rescore_articles_for_topic', {
          p_topic_id: topic.id
        });

        toast({
          title: "Keyword Added",
          description: `"${keywordValue}" added and articles rescored`,
        });
      } catch (error) {
        console.error('Error adding keyword:', error);
        toast({
          title: "Error",
          description: "Failed to add keyword",
          variant: "destructive"
        });
        // Revert on error
        setKeywords(keywords);
      } finally {
        setSaving(false);
      }
    }
  };

  const removeKeyword = async (index: number) => {
    const newKeywords = keywords.filter((_, i) => i !== index);
    setKeywords(newKeywords);
    
    // Auto-save removal immediately
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({ 
          keywords: newKeywords,
          updated_at: new Date().toISOString()
        })
        .eq('id', topic.id);

      if (error) throw error;

      const updatedTopic = {
        ...topic,
        keywords: newKeywords
      };
      onTopicUpdate(updatedTopic);
      
      toast({
        title: "Keyword Removed",
        description: "Keyword removed successfully",
      });
    } catch (error) {
      console.error('Error removing keyword:', error);
      toast({
        title: "Error",
        description: "Failed to remove keyword",
        variant: "destructive"
      });
      // Revert on error
      setKeywords(keywords);
    } finally {
      setSaving(false);
    }
  };

  const addLandmark = async (landmarkToAdd?: string) => {
    const landmarkValue = landmarkToAdd || newLandmark.trim();
    if (landmarkValue && !landmarks.includes(landmarkValue)) {
      const newLandmarks = [...landmarks, landmarkValue];
      setLandmarks(newLandmarks);
      if (!landmarkToAdd) setNewLandmark(''); // Only clear input if manually typed
      
      // Auto-save for regional fields too
      if (topic.topic_type === 'regional') {
        setSaving(true);
        try {
          const { error } = await supabase
            .from('topics')
            .update({ 
              landmarks: newLandmarks,
              updated_at: new Date().toISOString()
            })
            .eq('id', topic.id);

          if (error) throw error;

          const updatedTopic = {
            ...topic,
            landmarks: newLandmarks
          };
          onTopicUpdate(updatedTopic);
          
          toast({
            title: "Landmark Added",
            description: "Landmark added successfully",
          });
        } catch (error) {
          console.error('Error adding landmark:', error);
          toast({
            title: "Error",
            description: "Failed to add landmark",
            variant: "destructive"
          });
          setLandmarks(landmarks);
        } finally {
          setSaving(false);
        }
      }
    }
  };

  const removeLandmark = async (index: number) => {
    const newLandmarks = landmarks.filter((_, i) => i !== index);
    setLandmarks(newLandmarks);
    
    if (topic.topic_type === 'regional') {
      setSaving(true);
      try {
        const { error } = await supabase
          .from('topics')
          .update({ 
            landmarks: newLandmarks,
            updated_at: new Date().toISOString()
          })
          .eq('id', topic.id);

        if (error) throw error;

        const updatedTopic = {
          ...topic,
          landmarks: newLandmarks
        };
        onTopicUpdate(updatedTopic);
        
        toast({
          title: "Landmark Removed",
          description: "Landmark removed successfully",
        });
      } catch (error) {
        console.error('Error removing landmark:', error);
        toast({
          title: "Error", 
          description: "Failed to remove landmark",
          variant: "destructive"
        });
        setLandmarks(landmarks);
      } finally {
        setSaving(false);
      }
    }
  };

  const addPostcode = async (postcodeToAdd?: string) => {
    const postcodeValue = postcodeToAdd || newPostcode.trim();
    if (postcodeValue && !postcodes.includes(postcodeValue)) {
      const newPostcodes = [...postcodes, postcodeValue];
      setPostcodes(newPostcodes);
      if (!postcodeToAdd) setNewPostcode(''); // Only clear input if manually typed
      
      if (topic.topic_type === 'regional') {
        setSaving(true);
        try {
          const { error } = await supabase
            .from('topics')
            .update({ 
              postcodes: newPostcodes,
              updated_at: new Date().toISOString()
            })
            .eq('id', topic.id);

          if (error) throw error;

          const updatedTopic = {
            ...topic,
            postcodes: newPostcodes
          };
          onTopicUpdate(updatedTopic);
          
          toast({
            title: "Postcode Added",
            description: "Postcode added successfully",
          });
        } catch (error) {
          console.error('Error adding postcode:', error);
          toast({
            title: "Error",
            description: "Failed to add postcode",
            variant: "destructive"
          });
          setPostcodes(postcodes);
        } finally {
          setSaving(false);
        }
      }
    }
  };

  const removePostcode = async (index: number) => {
    const newPostcodes = postcodes.filter((_, i) => i !== index);
    setPostcodes(newPostcodes);
    
    if (topic.topic_type === 'regional') {
      setSaving(true);
      try {
        const { error } = await supabase
          .from('topics')
          .update({ 
            postcodes: newPostcodes,
            updated_at: new Date().toISOString()
          })
          .eq('id', topic.id);

        if (error) throw error;

        const updatedTopic = {
          ...topic,
          postcodes: newPostcodes
        };
        onTopicUpdate(updatedTopic);
        
        toast({
          title: "Postcode Removed",
          description: "Postcode removed successfully",
        });
      } catch (error) {
        console.error('Error removing postcode:', error);
        toast({
          title: "Error",
          description: "Failed to remove postcode",
          variant: "destructive"
        });
        setPostcodes(postcodes);
      } finally {
        setSaving(false);
      }
    }
  };

  const addOrganization = async (organizationToAdd?: string) => {
    const organizationValue = organizationToAdd || newOrganization.trim();
    if (organizationValue && !organizations.includes(organizationValue)) {
      const newOrganizations = [...organizations, organizationValue];
      setOrganizations(newOrganizations);
      if (!organizationToAdd) setNewOrganization(''); // Only clear input if manually typed
      
      if (topic.topic_type === 'regional') {
        setSaving(true);
        try {
          const { error } = await supabase
            .from('topics')
            .update({ 
              organizations: newOrganizations,
              updated_at: new Date().toISOString()
            })
            .eq('id', topic.id);

          if (error) throw error;

          const updatedTopic = {
            ...topic,
            organizations: newOrganizations
          };
          onTopicUpdate(updatedTopic);
          
          toast({
            title: "Organization Added",
            description: "Organization added successfully",
          });
        } catch (error) {
          console.error('Error adding organization:', error);
          toast({
            title: "Error",
            description: "Failed to add organization",
            variant: "destructive"
          });
          setOrganizations(organizations);
        } finally {
          setSaving(false);
        }
      }
    }
  };

  const removeOrganization = async (index: number) => {
    const newOrganizations = organizations.filter((_, i) => i !== index);
    setOrganizations(newOrganizations);
    
    if (topic.topic_type === 'regional') {
      setSaving(true);
      try {
        const { error } = await supabase
          .from('topics')
          .update({ 
            organizations: newOrganizations,
            updated_at: new Date().toISOString()
          })
          .eq('id', topic.id);

        if (error) throw error;

        const updatedTopic = {
          ...topic,
          organizations: newOrganizations
        };
        onTopicUpdate(updatedTopic);
        
        toast({
          title: "Organization Removed",
          description: "Organization removed successfully",
        });
      } catch (error) {
        console.error('Error removing organization:', error);
        toast({
          title: "Error",
          description: "Failed to remove organization", 
          variant: "destructive"
        });
        setOrganizations(organizations);
      } finally {
        setSaving(false);
      }
    }
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
              <Button 
                onClick={() => addKeyword()} 
                size="sm" 
                variant="outline"
                disabled={saving}
              >
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
                    disabled={saving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            
            {/* Keyword Suggestions */}
            <KeywordSuggestionTool
              topicId={topic.id}
              topicName={topic.name}
              description=""
              keywords={keywords}
              topicType={topic.topic_type}
              region={topic.region}
              onKeywordAdd={addKeyword}
              existingKeywords={keywords}
            />
          </div>

          {/* Auto-populate for Regional Topics */}
          {topic.topic_type === 'regional' && (
            <RegionalKeywordAutoPopulate
              topicId={topic.id}
              topicName={topic.name}
              region={topic.region || topic.name}
              currentKeywords={keywords}
              onKeywordsUpdated={async () => {
                // Refresh topic data
                const { data: updatedTopic } = await supabase
                  .from('topics')
                  .select('*')
                  .eq('id', topic.id)
                  .single();
                
                if (updatedTopic) {
                  onTopicUpdate({
                    ...topic,
                    keywords: updatedTopic.keywords || [],
                    landmarks: updatedTopic.landmarks || [],
                    postcodes: updatedTopic.postcodes || [],
                    organizations: updatedTopic.organizations || []
                  });
                }
              }}
            />
          )}

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
                  <Button onClick={() => addLandmark()} size="sm" variant="outline">
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
                
                {/* Landmark Suggestions */}
                {topic.region && (
                  <RegionalElementsSuggestionTool
                    topicName={topic.name}
                    region={topic.region}
                    description=""
                    keywords={keywords}
                    elementType="landmarks"
                    existingElements={landmarks}
                    onElementAdd={addLandmark}
                    existingLandmarks={landmarks}
                    existingPostcodes={postcodes}
                    existingOrganizations={organizations}
                  />
                )}
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
                  <Button onClick={() => addPostcode()} size="sm" variant="outline">
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
                
                {/* Postcode Suggestions */}
                {topic.region && (
                  <RegionalElementsSuggestionTool
                    topicName={topic.name}
                    region={topic.region}
                    description=""
                    keywords={keywords}
                    elementType="postcodes"
                    existingElements={postcodes}
                    onElementAdd={addPostcode}
                    existingLandmarks={landmarks}
                    existingPostcodes={postcodes}
                    existingOrganizations={organizations}
                  />
                )}
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
                  <Button onClick={() => addOrganization()} size="sm" variant="outline">
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
                
                {/* Organization Suggestions */}
                {topic.region && (
                  <RegionalElementsSuggestionTool
                    topicName={topic.name}
                    region={topic.region}
                    description=""
                    keywords={keywords}
                    elementType="organizations"
                    existingElements={organizations}
                    onElementAdd={addOrganization}
                    existingLandmarks={landmarks}
                    existingPostcodes={postcodes}
                    existingOrganizations={organizations}
                  />
                )}
              </div>
            </>
          )}

          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p className="font-medium mb-1">💡 Keywords are saved automatically</p>
            <ul className="text-xs space-y-1">
              <li>• Articles are re-scored when you add/remove keywords</li>
              <li>• Changes are applied immediately with visual feedback</li>
              <li>• Previously discarded articles may become relevant again</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};