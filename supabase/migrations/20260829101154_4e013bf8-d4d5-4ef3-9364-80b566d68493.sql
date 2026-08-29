
-- Taxonomy
CREATE TABLE public.story_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.story_categories(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX story_categories_global_slug_idx ON public.story_categories (slug) WHERE topic_id IS NULL;
CREATE UNIQUE INDEX story_categories_topic_slug_idx ON public.story_categories (topic_id, slug) WHERE topic_id IS NOT NULL;
CREATE INDEX story_categories_parent_idx ON public.story_categories (parent_id);

GRANT SELECT ON public.story_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_categories TO authenticated;
GRANT ALL ON public.story_categories TO service_role;
ALTER TABLE public.story_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are readable by everyone"
  ON public.story_categories FOR SELECT USING (true);
CREATE POLICY "Owners manage their feed categories"
  ON public.story_categories FOR ALL TO authenticated
  USING (
    topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = story_categories.topic_id AND t.created_by = (select auth.uid())
    )
    OR public.has_role((select auth.uid()), 'admin')
  )
  WITH CHECK (
    topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = story_categories.topic_id AND t.created_by = (select auth.uid())
    )
    OR public.has_role((select auth.uid()), 'admin')
  );

-- Assignments
CREATE TABLE public.story_category_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.story_categories(id) ON DELETE CASCADE,
  subcategory_id uuid REFERENCES public.story_categories(id) ON DELETE SET NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  model text,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id)
);
CREATE INDEX story_category_assignments_topic_idx ON public.story_category_assignments (topic_id);
CREATE INDEX story_category_assignments_category_idx ON public.story_category_assignments (category_id);

GRANT SELECT ON public.story_category_assignments TO anon;
GRANT SELECT ON public.story_category_assignments TO authenticated;
GRANT ALL ON public.story_category_assignments TO service_role;
ALTER TABLE public.story_category_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments are readable by everyone"
  ON public.story_category_assignments FOR SELECT USING (true);
CREATE POLICY "Admins manage assignments"
  ON public.story_category_assignments FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

-- Per-category feed settings
CREATE TABLE public.topic_category_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.story_categories(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  geographic_radius_miles integer,
  relevance_threshold integer,
  automation_mode text NOT NULL DEFAULT 'inherit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_category_settings TO authenticated;
GRANT ALL ON public.topic_category_settings TO service_role;
ALTER TABLE public.topic_category_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their category settings"
  ON public.topic_category_settings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_category_settings.topic_id AND t.created_by = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_category_settings.topic_id AND t.created_by = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'admin')
  );

-- Period reviews
CREATE TABLE public.topic_period_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative text,
  is_public boolean NOT NULL DEFAULT true,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, slug)
);

GRANT SELECT ON public.topic_period_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_period_reviews TO authenticated;
GRANT ALL ON public.topic_period_reviews TO service_role;
ALTER TABLE public.topic_period_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reviews are readable"
  ON public.topic_period_reviews FOR SELECT USING (is_public = true);
CREATE POLICY "Owners manage their reviews"
  ON public.topic_period_reviews FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_period_reviews.topic_id AND t.created_by = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_period_reviews.topic_id AND t.created_by = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'admin')
  );

-- Taxonomy discovery runs
CREATE TABLE public.taxonomy_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sample_size integer NOT NULL DEFAULT 0,
  proposal jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.taxonomy_discovery_runs TO authenticated;
GRANT ALL ON public.taxonomy_discovery_runs TO service_role;
ALTER TABLE public.taxonomy_discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their discovery runs"
  ON public.taxonomy_discovery_runs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = taxonomy_discovery_runs.topic_id AND t.created_by = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'admin')
  );

-- updated_at triggers
CREATE TRIGGER update_story_categories_updated_at BEFORE UPDATE ON public.story_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_story_category_assignments_updated_at BEFORE UPDATE ON public.story_category_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_topic_category_settings_updated_at BEFORE UPDATE ON public.topic_category_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_topic_period_reviews_updated_at BEFORE UPDATE ON public.topic_period_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_taxonomy_discovery_runs_updated_at BEFORE UPDATE ON public.taxonomy_discovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
