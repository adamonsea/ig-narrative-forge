import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generate a subtle, pleasant chime using Web Audio API
const playPublishChime = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create two oscillators for a richer sound
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Pleasant frequencies (C5 and E5 - major third)
    osc1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    osc2.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
    
    osc1.type = 'sine';
    osc2.type = 'sine';
    
    // Connect oscillators through gain
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Subtle volume with quick fade out
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    // Play for 400ms
    osc1.start(audioContext.currentTime);
    osc2.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.4);
    osc2.stop(audioContext.currentTime + 0.4);
    
    // Cleanup
    setTimeout(() => audioContext.close(), 500);
  } catch (error) {
    console.log('Could not play publish chime:', error);
  }
};

export const useDripFeedPublishSound = (topicId: string | undefined, enabled: boolean = true) => {
  const previousStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!topicId || !enabled) return;

    // Subscribe to story status changes for this topic
    const channel = supabase
      .channel(`drip-publish-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories',
          filter: `status=eq.published`
        },
        (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          
          // Check if this was a drip feed publish (had scheduled_publish_at and changed from ready to published)
          if (
            oldRecord?.status === 'ready' && 
            newRecord?.status === 'published' &&
            newRecord?.scheduled_publish_at
          ) {
            console.log('🔔 Drip feed story published:', newRecord.id);
            playPublishChime();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId, enabled]);
};
