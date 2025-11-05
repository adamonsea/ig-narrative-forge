// Domain Profile System for Multi-Tenant Scraping Configuration
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DomainProfile {
  family?: 'newsquest' | 'reach' | 'jpi' | 'custom';
  arcSite?: string;
  sectionFallbacks?: string[];
  alternateRoutes?: {
    route: string;
    conditions?: {
      urlPattern?: RegExp;
      hasFamily?: string;
    };
  }[];
  accessibility?: {
    bypassHead?: boolean;
    timeout?: number;
  };
  warmup?: {
    enabled?: boolean;
    delay?: number;
  };
}

export interface DomainProfileSource {
  domain_key: string;
  profile: DomainProfile;
}

/**
 * Resolves domain profile with multi-layered fallback:
 * 1. Topic-specific domain profile (highest priority)
 * 2. Tenant-specific domain profile
 * 3. Global domain profile
 * 4. Source metadata hints
 * 5. URL-based inference (lowest priority)
 */
export async function resolveDomainProfile(
  supabase: SupabaseClient,
  feedUrl: string,
  topicId?: string,
  tenantId?: string,
  sourceMetadata?: Record<string, any>
): Promise<DomainProfile> {
  const hostname = new URL(feedUrl).hostname.replace(/^www\./, '');
  
  // Layer 1: Topic-specific profile
  if (topicId) {
    const { data: topicProfile } = await supabase
      .from('scraper_domain_profiles')
      .select('profile')
      .eq('topic_id', topicId)
      .eq('domain_key', hostname)
      .single();
    
    if (topicProfile?.profile) {
      return topicProfile.profile as DomainProfile;
    }
  }
  
  // Layer 2: Tenant-specific profile
  if (tenantId) {
    const { data: tenantProfile } = await supabase
      .from('scraper_domain_profiles')
      .select('profile')
      .eq('tenant_id', tenantId)
      .eq('domain_key', hostname)
      .single();
    
    if (tenantProfile?.profile) {
      return tenantProfile.profile as DomainProfile;
    }
  }
  
  // Layer 3: Global profile
  const { data: globalProfile } = await supabase
    .from('scraper_domain_profiles')
    .select('profile')
    .is('tenant_id', null)
    .is('topic_id', null)
    .eq('domain_key', hostname)
    .single();
  
  if (globalProfile?.profile) {
    return globalProfile.profile as DomainProfile;
  }
  
  // Layer 4: Source metadata hints
  if (sourceMetadata) {
    const profile: DomainProfile = {};
    
    if (sourceMetadata.publisher?.toLowerCase().includes('newsquest')) {
      profile.family = 'newsquest';
      profile.accessibility = { bypassHead: true };
    }
    
    if (sourceMetadata.arcSite) {
      profile.arcSite = sourceMetadata.arcSite;
    }
    
    if (Object.keys(profile).length > 0) {
      return profile;
    }
  }
  
  // Layer 5: URL-based inference
  return inferDomainProfile(hostname);
}

/**
 * Infers basic domain profile from hostname patterns
 */
function inferDomainProfile(hostname: string): DomainProfile {
  const profile: DomainProfile = {};
  
  // Common Newsquest domains (fallback if not in database)
  const newsquestPatterns = [
    /argus\.co\.uk$/,
    /express\.co\.uk$/,
    /gazette\.co\.uk$/,
    /telegraph\.co\.uk$/,
    /echo\.co\.uk$/,
    /news\.co\.uk$/,
  ];
  
  if (newsquestPatterns.some(pattern => pattern.test(hostname))) {
    profile.family = 'newsquest';
    profile.accessibility = { bypassHead: true };
  }
  
  return profile;
}

/**
 * Merges multiple domain profiles, with higher priority profiles overriding lower ones
 */
export function mergeDomainProfiles(...profiles: DomainProfile[]): DomainProfile {
  return profiles.reduce((merged, profile) => ({
    ...merged,
    ...profile,
    accessibility: {
      ...merged.accessibility,
      ...profile.accessibility,
    },
    warmup: {
      ...merged.warmup,
      ...profile.warmup,
    },
    sectionFallbacks: profile.sectionFallbacks || merged.sectionFallbacks,
    alternateRoutes: profile.alternateRoutes || merged.alternateRoutes,
  }), {} as DomainProfile);
}
