-- Swipe Mode: Reader profiles and story swipes tables
-- These tables are completely isolated from existing functionality

-- Reader profiles for swipe mode users
CREATE TABLE IF NOT EXISTS public.reader_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_profile UNIQUE(user_id)
);

-- Story swipes (like/discard tracking)
CREATE TABLE IF NOT EXISTS public.story_swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  swipe_type TEXT NOT NULL CHECK (swipe_type IN ('like', 'discard', 'super_like')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_story_swipe UNIQUE(user_id, story_id)
);

-- Enable RLS
ALTER TABLE public.reader_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_swipes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see/manage their own data
CREATE POLICY "Users can view own profile" ON public.reader_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.reader_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.reader_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own swipes" ON public.story_swipes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own swipes" ON public.story_swipes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own swipes" ON public.story_swipes
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger: Auto-create reader profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_reader_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.reader_profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_reader_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_reader_profile();

-- Indexes for performance
CREATE INDEX idx_reader_profiles_user_id ON public.reader_profiles(user_id);
CREATE INDEX idx_story_swipes_user_id ON public.story_swipes(user_id);
CREATE INDEX idx_story_swipes_story_id ON public.story_swipes(story_id);
CREATE INDEX idx_story_swipes_topic_id ON public.story_swipes(topic_id);
CREATE INDEX idx_story_swipes_created_at ON public.story_swipes(created_at DESC);