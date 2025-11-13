import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const MEDICAL_DEVICE_DEVELOPMENT_KEYWORDS = [
  'fda approval process',
  'prototype development',
  'regulatory compliance',
  'quality management systems',
  'design controls',
  'human factors engineering',
  'sterilization validation',
  'verification and validation',
  'risk management',
  'medical device manufacturing',
  'iso 13485',
  'usability testing',
  'premarket submission',
  'supply chain optimization',
  'rfid medical technology',
  '3d printing medical implants',
  'at-home diagnostic devices',
  'surgical efficiency technologies',
  'power delivery systems',
  'spinal cord repair devices',
  'dermatology diagnostic tools',
  'medical device materials science',
  'surgical inventory management',
  'implantable medical devices',
  'point-of-care testing',
  'medical device cybersecurity',
  'biocompatibility testing',
  'medical device software validation',
  'regulatory strategy medical devices',
  'digital health technologies',
  'medical device post-market surveillance',
  'medical device innovation',
  'medical device clinical evaluation',
  'organoid technology',
  'hiv prevention technology',
  'stem cell medical applications',
  'in vitro diagnostics',
  'continuous glucose monitoring',
  'biomarker detection technology',
  'monoclonal antibody delivery systems',
  'cell therapy devices',
  'immune cell engineering devices',
  'liquid biopsy technology',
  'organ-on-chip technology',
  'medical device recall management',
  'drug delivery systems',
  'point-of-care imaging',
  'bioreactor technology',
  'medical device clinical evidence',
  'telemedicine devices',
  'medical device biocompatibility standards',
  'orthopedic implants',
  'cardiovascular devices',
  'surgical instruments',
  'diagnostic equipment',
  'prosthetic devices',
  'surgical technology',
  'patient monitoring',
  'imaging devices',
  'respiratory devices',
  'neurological devices',
  'dental devices',
  'ophthalmic devices',
  'wound care devices',
  'rehabilitation devices',
  'device development',
  'device manufacturing',
  'medtech industry',
  'device regulation',
  'device approval',
  'device commercialization',
  'device design',
  'device testing',
  'regulatory submission',
  'quality assurance',
  'device validation'
];

export const TopicKeywordUpdater = () => {
  const [updating, setUpdating] = useState(false);
  const [scraping, setScraping] = useState(false);

  const updateKeywords = async () => {
    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from('topics')
        .update({ 
          keywords: MEDICAL_DEVICE_DEVELOPMENT_KEYWORDS,
          updated_at: new Date().toISOString()
        })
        .eq('id', '3f05c5a3-3196-455d-bff4-e9a9a20b8615')
        .select('id, name, keywords')
        .single();

      if (error) throw error;

      toast.success(`Updated keywords for ${data.name}`, {
        description: `Now has ${data.keywords.length} keywords (removed: technology, clinical trials, biomedical engineering, medical device technology)`
      });
    } catch (error: any) {
      console.error('Error updating keywords:', error);
      toast.error('Failed to update keywords', {
        description: error.message
      });
    } finally {
      setUpdating(false);
    }
  };

  const triggerBackfill = async () => {
    setScraping(true);
    try {
      toast.info('Starting 60-day backfill...', {
        description: 'This will take a few minutes'
      });

      const { data, error } = await supabase.functions.invoke('manual-topic-scrape', {
        body: {
          topicId: '3f05c5a3-3196-455d-bff4-e9a9a20b8615',
          maxAgeDays: 60,
          forceRescan: true
        }
      });

      if (error) throw error;

      toast.success('Backfill completed', {
        description: `Processed ${data.sources?.length || 0} sources`
      });
    } catch (error: any) {
      console.error('Error triggering backfill:', error);
      toast.error('Failed to trigger backfill', {
        description: error.message
      });
    } finally {
      setScraping(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Medical Device Development - Keyword Update</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Removes generic keywords (technology, clinical trials, etc.) and adds development-specific terms.
        </p>
        <div className="space-y-2">
          <Button 
            onClick={updateKeywords} 
            disabled={updating || scraping}
            className="w-full"
          >
            {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            1. Update Keywords ({MEDICAL_DEVICE_DEVELOPMENT_KEYWORDS.length} total)
          </Button>
          <Button 
            onClick={triggerBackfill} 
            disabled={scraping || updating}
            variant="secondary"
            className="w-full"
          >
            {scraping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            2. Run 60-Day Backfill
          </Button>
        </div>
      </div>
    </Card>
  );
};
