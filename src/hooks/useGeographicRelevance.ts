import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GeographicData {
  totalVisitors: number;
  targetRegionVisitors: number;
  relevancePercent: number;
  topCountries: { code: string; count: number; percent: number }[];
  targetCountryCode: string;
}

interface UseGeographicRelevanceResult {
  data: GeographicData | null;
  loading: boolean;
  error: string | null;
}

// Map topic regions to expected country codes
// UK regional topics expect UK visitors
const REGION_TO_COUNTRY: Record<string, string> = {
  // UK regions
  'Eastbourne': 'GB',
  'Kenilworth': 'GB',
  'London': 'GB',
  'Manchester': 'GB',
  'Birmingham': 'GB',
  'Bristol': 'GB',
  'Brighton': 'GB',
  'Leeds': 'GB',
  'Liverpool': 'GB',
  'Sheffield': 'GB',
  'Edinburgh': 'GB',
  'Glasgow': 'GB',
  'Cardiff': 'GB',
  'Belfast': 'GB',
  // Add more as needed
};

// For regional topics, default to GB if not explicitly mapped
const getTargetCountryCode = (region: string | null, topicType: string | null): string => {
  if (!region) return 'GB'; // Default for non-regional topics
  
  // Check explicit mapping
  if (REGION_TO_COUNTRY[region]) {
    return REGION_TO_COUNTRY[region];
  }
  
  // For regional UK topics, default to GB
  if (topicType === 'regional') {
    return 'GB';
  }
  
  return 'GB'; // Default fallback
};

export const useGeographicRelevance = (topicId: string, days: number = 30): UseGeographicRelevanceResult => {
  const [data, setData] = useState<GeographicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topicId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch topic info and visit data in parallel
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const [topicRes, visitsRes] = await Promise.all([
          supabase
            .from('topics')
            .select('region, topic_type')
            .eq('id', topicId)
            .single(),
          supabase
            .from('site_visits')
            .select('visitor_id, country_code')
            .eq('topic_id', topicId)
            .gte('visit_date', startDateStr)
        ]);

        if (topicRes.error) throw topicRes.error;
        if (visitsRes.error) throw visitsRes.error;

        const topic = topicRes.data;
        const visits = visitsRes.data || [];

        // Get target country for this topic
        const targetCountryCode = getTargetCountryCode(topic?.region, topic?.topic_type);

        // Count unique visitors by country
        const visitorsByCountry = new Map<string, Set<string>>();
        const allVisitors = new Set<string>();

        for (const visit of visits) {
          allVisitors.add(visit.visitor_id);
          const country = visit.country_code || 'Unknown';
          
          if (!visitorsByCountry.has(country)) {
            visitorsByCountry.set(country, new Set());
          }
          visitorsByCountry.get(country)!.add(visit.visitor_id);
        }

        const totalVisitors = allVisitors.size;
        const targetRegionVisitors = visitorsByCountry.get(targetCountryCode)?.size || 0;
        const relevancePercent = totalVisitors > 0 
          ? Math.round((targetRegionVisitors / totalVisitors) * 100) 
          : 0;

        // Get top countries
        const topCountries = Array.from(visitorsByCountry.entries())
          .map(([code, visitors]) => ({
            code,
            count: visitors.size,
            percent: totalVisitors > 0 ? Math.round((visitors.size / totalVisitors) * 100) : 0
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setData({
          totalVisitors,
          targetRegionVisitors,
          relevancePercent,
          topCountries,
          targetCountryCode
        });
      } catch (err) {
        console.error('Error loading geographic relevance:', err);
        setError(err instanceof Error ? err.message : 'Failed to load geographic data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [topicId, days]);

  return { data, loading, error };
};

// Country code to name mapping for display
export const COUNTRY_NAMES: Record<string, string> = {
  'GB': '🇬🇧 UK',
  'US': '🇺🇸 US',
  'DE': '🇩🇪 Germany',
  'FR': '🇫🇷 France',
  'ES': '🇪🇸 Spain',
  'IT': '🇮🇹 Italy',
  'NL': '🇳🇱 Netherlands',
  'BE': '🇧🇪 Belgium',
  'IE': '🇮🇪 Ireland',
  'AU': '🇦🇺 Australia',
  'CA': '🇨🇦 Canada',
  'IN': '🇮🇳 India',
  'JP': '🇯🇵 Japan',
  'CN': '🇨🇳 China',
  'BR': '🇧🇷 Brazil',
  'PT': '🇵🇹 Portugal',
  'PL': '🇵🇱 Poland',
  'SE': '🇸🇪 Sweden',
  'NO': '🇳🇴 Norway',
  'DK': '🇩🇰 Denmark',
  'FI': '🇫🇮 Finland',
  'CH': '🇨🇭 Switzerland',
  'AT': '🇦🇹 Austria',
  'Unknown': '❓ Unknown'
};

export const getCountryName = (code: string): string => {
  return COUNTRY_NAMES[code] || `🌍 ${code}`;
};
