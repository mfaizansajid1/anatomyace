
-- user_stats table
CREATE TABLE public.user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_goal INTEGER NOT NULL DEFAULT 20,
  cards_studied_today INTEGER NOT NULL DEFAULT 0,
  cards_studied_total INTEGER NOT NULL DEFAULT 0,
  cards_studied_this_week INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_study_date DATE,
  last_topic_studied TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stats TO authenticated;
GRANT ALL ON public.user_stats TO service_role;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own stats" ON public.user_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- topic_performance table
CREATE TABLE public.topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  accuracy_percentage INTEGER NOT NULL DEFAULT 0,
  cards_due_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_performance TO authenticated;
GRANT ALL ON public.topic_performance TO service_role;
ALTER TABLE public.topic_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own topic performance" ON public.topic_performance FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- daily activity for weekly chart
CREATE TABLE public.study_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_date DATE NOT NULL,
  cards_studied INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, study_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_activity TO authenticated;
GRANT ALL ON public.study_activity TO service_role;
ALTER TABLE public.study_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own study activity" ON public.study_activity FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_user_stats_updated BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_topic_perf_updated BEFORE UPDATE ON public.topic_performance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create user_stats row on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created_stats
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();

-- Backfill existing users
INSERT INTO public.user_stats (user_id)
SELECT id FROM auth.users ON CONFLICT DO NOTHING;
