import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Slide {
  type: string;
  content: string;
  word_count: number;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { topicId } = await req.json();

    if (!topicId) {
      throw new Error('topicId is required');
    }

    console.log(`[Social Proof] Generating card for topic: ${topicId}`);

    // Fetch topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('name, slug')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Display boost utility: adds +15 for small communities, accurate for established ones
    const getDisplayCount = (actualCount: number): number => {
      if (actualCount >= 100) return actualCount;
      return actualCount + 15;
    };

    // Get all-time unique readers (deduplicate visitor_ids)
    const { data: allReaders, error: readersError } = await supabase
      .from('story_interactions')
      .select('visitor_id')
      .eq('topic_id', topicId)
      .neq('visitor_id', '');

    if (readersError) throw readersError;
    
    const actualTotalReaders = new Set(allReaders?.map(r => r.visitor_id) || []).size;
    const displayTotalReaders = getDisplayCount(actualTotalReaders);

    // Get last 7 days unique readers
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: weekData, error: weekError } = await supabase
      .from('story_interactions')
      .select('visitor_id')
      .eq('topic_id', topicId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .neq('visitor_id', '');

    if (weekError) throw weekError;
    
    const actualWeekReaders = new Set(weekData?.map(r => r.visitor_id) || []).size;

    // Get previous week readers for growth calculation
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const { data: prevWeekData, error: prevWeekError } = await supabase
      .from('story_interactions')
      .select('visitor_id')
      .eq('topic_id', topicId)
      .gte('created_at', fourteenDaysAgo.toISOString())
      .lt('created_at', sevenDaysAgo.toISOString())
      .neq('visitor_id', '');

    if (prevWeekError) throw prevWeekError;
    
    const actualPreviousWeekReaders = new Set(prevWeekData?.map(r => r.visitor_id) || []).size;
    const readerGrowth = actualWeekReaders - actualPreviousWeekReaders;

    // Get PWA installs
    const { count: pwaInstalls } = await supabase
      .from('topic_engagement_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('topic_id', topicId)
      .eq('metric_type', 'pwa_install');

    // Get notification subscribers
    const { count: notificationSubs } = await supabase
      .from('topic_engagement_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('topic_id', topicId)
      .eq('metric_type', 'notification_subscription');

    // Get most shared story in last 7 days
    const { data: topSharedStory } = await supabase
      .from('story_interactions')
      .select('story_id, stories!inner(id, title, slug)')
      .eq('topic_id', topicId)
      .eq('interaction_type', 'share_click')
      .gte('created_at', sevenDaysAgo.toISOString())
      .limit(1000);

    let mostSharedStory = null;
    let mostSharedCount = 0;

    if (topSharedStory && topSharedStory.length > 0) {
      const shareCounts: Record<string, { count: number; story: any }> = {};
      
      topSharedStory.forEach(interaction => {
        const storyId = interaction.story_id;
        if (!shareCounts[storyId]) {
          shareCounts[storyId] = { count: 0, story: interaction.stories };
        }
        shareCounts[storyId].count++;
      });

      const sortedStories = Object.values(shareCounts).sort((a, b) => b.count - a.count);
      if (sortedStories.length > 0 && sortedStories[0].count > 0) {
        mostSharedStory = sortedStories[0].story;
        mostSharedCount = sortedStories[0].count;
      }
    }

    // Calculate peak reading times (hour of day)
    const { data: hourlyActivity } = await supabase
      .from('story_interactions')
      .select('created_at')
      .eq('topic_id', topicId)
      .gte('created_at', sevenDaysAgo.toISOString());

    const hourCounts: Record<number, number> = {};
    
    if (hourlyActivity) {
      hourlyActivity.forEach(interaction => {
        const hour = new Date(interaction.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
    }

    const sortedHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    const formatPeakTime = (hour: number): string => {
      if (hour >= 6 && hour < 9) return `Morning (${hour}am)`;
      if (hour >= 9 && hour < 12) return `Mid-morning (${hour}am)`;
      if (hour >= 12 && hour < 17) return `Afternoon (${hour > 12 ? hour - 12 : hour}pm)`;
      if (hour >= 17 && hour < 22) return `Evening (${hour - 12}pm)`;
      return `Night (${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'am' : 'pm'})`;
    };

    const peakTimesText = sortedHours.length > 0
      ? sortedHours.map(formatPeakTime).join(' • ')
      : 'Throughout the day';

    // Calculate milestone progress using ACTUAL count for internal logic
    const milestones = [50, 100, 250, 500, 1000, 2500, 5000];
    const nextMilestone = milestones.find(m => m > actualTotalReaders) || milestones[milestones.length - 1];
    const toMilestone = nextMilestone - actualTotalReaders;

    // Behaviorally powerful tiered messaging - uses DISPLAYED count for user-facing text
    const getMilestoneMessaging = (displayCount: number, actualCount: number, topicName: string, toMilestone: number, nextMilestone: number, readerGrowth: number) => {
      // Tier logic based on ACTUAL count
      if (actualCount < 50) {
        return {
          tier: 'founding',
          hookText: `🌱 You're 1 of only **${displayCount}** founding members of ${topicName}`,
          ctaText: 'Share a story to help us grow',
          shareMessage: `I'm one of the first ${displayCount} people following ${topicName} on eeZee — join me!`
        };
      } else if (actualCount < 150) {
        return {
          tier: 'early_adopter', 
          hookText: `📈 **${displayCount}** readers and counting — you're part of something growing`,
          ctaText: `Help us reach ${nextMilestone}`,
          shareMessage: `Join ${displayCount} readers staying informed about ${topicName} on eeZee`
        };
      } else if (toMilestone > 0 && toMilestone <= nextMilestone * 0.2) {
        return {
          tier: 'near_milestone',
          hookText: `🏁 Just **${toMilestone}** more ${toMilestone === 1 ? 'reader' : 'readers'} until we hit **${nextMilestone}**!`,
          ctaText: 'Your share could be the one',
          shareMessage: `Help ${topicName} reach ${nextMilestone} readers — we're only ${toMilestone} away!`
        };
      } else if (actualCount >= 500) {
        return {
          tier: 'established',
          hookText: `👥 **${displayCount}** readers trust this feed — you're in good company`,
          ctaText: 'Share with someone who\'d love it',
          shareMessage: `${displayCount} people stay informed about ${topicName} on eeZee`
        };
      }
      // Default growing community
      return {
        tier: 'growing',
        hookText: `💪 **${displayCount}** people stay informed here${readerGrowth > 0 ? `\n\n📈 +${readerGrowth} this week` : ''}`,
        ctaText: `${toMilestone} away from ${nextMilestone}`,
        shareMessage: `Stay informed about ${topicName} with ${displayCount} other readers on eeZee`
      };
    };

    const messaging = getMilestoneMessaging(displayTotalReaders, actualTotalReaders, topic.name, toMilestone, nextMilestone, readerGrowth);

    // Build slides with behavioral messaging
    const slides: Slide[] = [
      {
        type: 'hook',
        content: messaging.hookText,
        word_count: messaging.hookText.split(' ').length,
        metadata: {
          messagingTier: messaging.tier
        }
      }
    ];

    // Add peak times slide if we have data
    if (sortedHours.length > 0) {
      slides.push({
        type: 'content',
        content: `🕐 **When readers are active**\n\n${peakTimesText}\n\n*You're part of an active community*`,
        word_count: 12
      });
    }

    // Add most shared story if available
    if (mostSharedStory && mostSharedCount > 0) {
      slides.push({
        type: 'content',
        content: `📤 **Most shared this week**\n\n"${mostSharedStory.title}" — ${mostSharedCount} ${mostSharedCount === 1 ? 'share' : 'shares'}`,
        word_count: 10,
        metadata: {
          storyId: mostSharedStory.id,
          storySlug: mostSharedStory.slug
        }
      });
    }

    // Add engagement stats if significant
    if ((pwaInstalls || 0) > 5 || (notificationSubs || 0) > 5) {
      const engagementParts: string[] = [];
      if ((pwaInstalls || 0) > 5) engagementParts.push(`📱 ${pwaInstalls} installed the app`);
      if ((notificationSubs || 0) > 5) engagementParts.push(`🔔 ${notificationSubs} get notifications`);
      
      slides.push({
        type: 'content',
        content: `**Engaged community**\n\n${engagementParts.join('\n')}`,
        word_count: 8
      });
    }

    // Add CTA slide with share intent (uses DISPLAYED count)
    slides.push({
      type: 'cta',
      content: `**${messaging.ctaText}**\n\n${messaging.tier === 'founding' ? '🌟 Be part of building something special' : messaging.tier === 'near_milestone' ? '🎯 We\'re so close!' : '💬 Spread the word'}`,
      word_count: 8,
      metadata: {
        ctaType: 'share',
        shareMessage: messaging.shareMessage,
        messagingTier: messaging.tier,
        currentCount: displayTotalReaders,
        targetCount: messaging.tier !== 'established' ? nextMilestone : undefined
      }
    });

    // Calculate relevance score (based on ACTUAL count)
    let relevanceScore = 50; // base score
    
    // Higher if growing
    if (readerGrowth > 0) relevanceScore += 15;
    
    // Higher if close to milestone
    if (toMilestone > 0 && toMilestone <= nextMilestone * 0.2) relevanceScore += 20;
    
    // Higher if there's a popular shared story
    if (mostSharedCount > 3) relevanceScore += 15;
    
    // Lower if very little activity
    if (actualTotalReaders < 10) relevanceScore -= 20;

    relevanceScore = Math.max(0, Math.min(100, relevanceScore));

    // Set valid until (7 days from now)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    // Check for existing card
    const { data: existingCard } = await supabase
      .from('automated_insight_cards')
      .select('id')
      .eq('topic_id', topicId)
      .eq('card_type', 'social_proof')
      .eq('is_published', true)
      .gt('valid_until', new Date().toISOString())
      .single();

    if (existingCard) {
      console.log(`[Social Proof] Valid card already exists for topic ${topicId}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Valid card already exists',
          cardId: existingCard.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert the card
    const { data: insertedCard, error: insertError } = await supabase
      .from('automated_insight_cards')
      .insert({
        topic_id: topicId,
        card_type: 'social_proof',
        headline: `Your ${topic.name} Community`,
        slides,
        insight_data: {
          actualTotalReaders,
          displayTotalReaders,
          weekReaders: actualWeekReaders,
          readerGrowth,
          pwaInstalls,
          notificationSubs,
          mostSharedStory: mostSharedStory ? {
            id: mostSharedStory.id,
            title: mostSharedStory.title,
            slug: mostSharedStory.slug,
            shareCount: mostSharedCount
          } : null,
          peakHours: sortedHours,
          nextMilestone,
          toMilestone,
          messagingTier: messaging.tier,
          shareMessage: messaging.shareMessage
        },
        relevance_score: relevanceScore,
        display_frequency: 12, // Show every ~12 stories
        valid_until: validUntil.toISOString(),
        is_published: true,
        is_visible: true
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log(`[Social Proof] Generated card for ${topic.name}: ${slides.length} slides, relevance ${relevanceScore}, tier: ${messaging.tier}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        cardId: insertedCard.id,
        slides: slides.length,
        relevanceScore,
        messagingTier: messaging.tier 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Social Proof] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
