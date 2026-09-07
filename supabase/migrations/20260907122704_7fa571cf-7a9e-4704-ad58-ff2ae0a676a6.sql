CREATE TABLE public.test_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('mcq','practical')),
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  plan_id UUID REFERENCES public.revision_plans(id) ON DELETE SET NULL,
  day_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, mode)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_results TO authenticated;
GRANT ALL ON public.test_results TO service_role;

ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own test results"
ON public.test_results FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_test_results_user_created ON public.test_results (user_id, created_at DESC);