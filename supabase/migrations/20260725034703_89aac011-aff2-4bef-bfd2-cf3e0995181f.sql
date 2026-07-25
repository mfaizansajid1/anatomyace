
-- Admin role system (roles kept OUT of users table for security)
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- Topics
CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  subject text NOT NULL DEFAULT 'Gross Anatomy',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.topics TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.topics TO authenticated;
GRANT ALL ON public.topics TO service_role;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can view topics" ON public.topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert topics" ON public.topics FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update topics" ON public.topics FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete topics" ON public.topics FOR DELETE TO authenticated USING (public.is_admin());

-- Subtopics
CREATE TABLE public.subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, name)
);
GRANT SELECT ON public.subtopics TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subtopics TO authenticated;
GRANT ALL ON public.subtopics TO service_role;
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can view subtopics" ON public.subtopics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert subtopics" ON public.subtopics FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update subtopics" ON public.subtopics FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete subtopics" ON public.subtopics FOR DELETE TO authenticated USING (public.is_admin());

-- Flashcards
CREATE TABLE public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  explanation text,
  clinical_correlation text,
  mnemonic text,
  high_yield_point text,
  difficulty text NOT NULL DEFAULT 'Medium' CHECK (difficulty IN ('Easy','Medium','Hard')),
  tags text[],
  image_url text,
  reference text,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.flashcards TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT ALL ON public.flashcards TO service_role;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view published cards" ON public.flashcards FOR SELECT TO authenticated USING (is_published OR public.is_admin());
CREATE POLICY "Admins insert cards" ON public.flashcards FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update cards" ON public.flashcards FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete cards" ON public.flashcards FOR DELETE TO authenticated USING (public.is_admin());

-- updated_at triggers
CREATE TRIGGER set_topics_updated BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_subtopics_updated BEFORE UPDATE ON public.subtopics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_flashcards_updated BEFORE UPDATE ON public.flashcards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed topics
INSERT INTO public.topics (name, subject, display_order) VALUES
  ('Upper Limb', 'Gross Anatomy', 1),
  ('Lower Limb', 'Gross Anatomy', 2),
  ('Thorax', 'Gross Anatomy', 3),
  ('Abdomen', 'Gross Anatomy', 4),
  ('Pelvis & Perineum', 'Gross Anatomy', 5),
  ('Head & Neck', 'Gross Anatomy', 6),
  ('Neuroanatomy', 'Neuroanatomy', 7);
