-- Add topics table for multi-tenant niche content
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  topic_type text NOT NULL CHECK (topic_type IN ('regional', 'keyword')) DEFAULT 'keyword',
  keywords text[] DEFAULT '{}',
  -- Regional-specific fields (for local news topics)
  region text,
  landmarks text[] DEFAULT '{}',
  postcodes text[] DEFAULT '{}',
  organizations text[] DEFAULT '{}',
  -- User ownership
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT false,
  -- SEO and branding
  slug text UNIQUE,
  custom_css jsonb DEFAULT '{}',
  branding_config jsonb DEFAULT '{}'
);

-- Add topic memberships for access control
CREATE TABLE IF NOT EXISTS public.topic_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')) DEFAULT 'viewer',
  created_at timestamptz DEFAULT now(),
  UNIQUE(topic_id, user_id)
);

-- Enable RLS on both tables
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for topics
CREATE POLICY "Topics viewable by members or public" 
ON public.topics 
FOR SELECT 
USING (
  is_public = true OR 
  auth.uid() IN (
    SELECT user_id FROM public.topic_memberships 
    WHERE topic_id = topics.id
  ) OR
  auth.uid() = created_by OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Topics manageable by owner or admin" 
ON public.topics 
FOR ALL 
USING (
  auth.uid() = created_by OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can create topics" 
ON public.topics 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- RLS Policies for topic memberships
CREATE POLICY "Topic memberships viewable by members" 
ON public.topic_memberships 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  auth.uid() IN (
    SELECT tm.user_id FROM public.topic_memberships tm 
    WHERE tm.topic_id = topic_memberships.topic_id AND tm.role = 'owner'
  ) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Topic memberships manageable by owners" 
ON public.topic_memberships 
FOR ALL 
USING (
  auth.uid() IN (
    SELECT tm.user_id FROM public.topic_memberships tm 
    WHERE tm.topic_id = topic_memberships.topic_id AND tm.role = 'owner'
  ) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Add topic_id to existing tables to bridge old and new systems
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL;
ALTER TABLE public.content_sources ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_topics_created_by ON public.topics(created_by);
CREATE INDEX IF NOT EXISTS idx_topics_type_active ON public.topics(topic_type, is_active);
CREATE INDEX IF NOT EXISTS idx_topics_slug ON public.topics(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_memberships_topic_user ON public.topic_memberships(topic_id, user_id);
CREATE INDEX IF NOT EXISTS idx_articles_topic_id ON public.articles(topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_sources_topic_id ON public.content_sources(topic_id) WHERE topic_id IS NOT NULL;

-- Add trigger to update updated_at
CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function to check if user has access to topic
CREATE OR REPLACE FUNCTION public.user_has_topic_access(p_topic_id uuid, p_required_role text DEFAULT 'viewer')
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.topic_memberships tm
    JOIN public.topics t ON t.id = tm.topic_id
    WHERE tm.topic_id = p_topic_id 
    AND (
      tm.user_id = auth.uid() 
      OR t.created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
    )
    AND (
      p_required_role = 'viewer' OR
      (p_required_role = 'editor' AND tm.role IN ('owner', 'editor')) OR
      (p_required_role = 'owner' AND tm.role = 'owner') OR
      t.created_by = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );
$$;

-- Create initial "Eastbourne" regional topic as migration bridge
INSERT INTO public.topics (
  name, 
  description, 
  topic_type, 
  region, 
  keywords, 
  landmarks, 
  postcodes, 
  organizations,
  created_by,
  slug,
  is_public
) 
SELECT 
  'Eastbourne',
  'Local news and updates for Eastbourne and surrounding areas',
  'regional',
  'Eastbourne',
  ARRAY['eastbourne', 'local', 'community', 'news', 'council', 'events'],
  ARRAY['Pier', 'Town Hall', 'Arndale Centre', 'Sovereign Harbour', 'Beachy Head', 'Congress Theatre'],
  ARRAY['BN20', 'BN21', 'BN22', 'BN23', 'BN24'],
  ARRAY['Eastbourne Borough Council', 'East Sussex County Council', 'Eastbourne Herald', 'South Coast Ambulance'],
  (SELECT id FROM auth.users LIMIT 1), -- Assign to first user if exists
  'eastbourne',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.topics WHERE slug = 'eastbourne');

-- Link existing Eastbourne articles to the new topic
UPDATE public.articles 
SET topic_id = (SELECT id FROM public.topics WHERE slug = 'eastbourne' LIMIT 1)
WHERE region = 'Eastbourne' AND topic_id IS NULL;

-- Link existing Eastbourne sources to the new topic  
UPDATE public.content_sources
SET topic_id = (SELECT id FROM public.topics WHERE slug = 'eastbourne' LIMIT 1)
WHERE region = 'Eastbourne' AND topic_id IS NULL;