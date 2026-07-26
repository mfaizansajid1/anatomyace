
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view categories"
  ON public.categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update categories"
  ON public.categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete categories"
  ON public.categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add category_id to subtopics (nullable temporarily)
ALTER TABLE public.subtopics
  ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE;

-- Migrate: create a "General" category per topic that has orphan subtopics
INSERT INTO public.categories (topic_id, name, display_order)
SELECT DISTINCT s.topic_id, 'General', 0
FROM public.subtopics s
WHERE s.category_id IS NULL
ON CONFLICT (topic_id, name) DO NOTHING;

-- Assign orphan subtopics to their topic's General category
UPDATE public.subtopics s
SET category_id = c.id
FROM public.categories c
WHERE s.category_id IS NULL
  AND c.topic_id = s.topic_id
  AND c.name = 'General';

-- Now enforce not-null
ALTER TABLE public.subtopics ALTER COLUMN category_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subtopics_category_id ON public.subtopics(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_topic_id ON public.categories(topic_id);
