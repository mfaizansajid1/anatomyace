CREATE TABLE public.test_timer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_minutes_per_question numeric NOT NULL DEFAULT 0.5,
  max_minutes_per_question numeric NOT NULL DEFAULT 3,
  auto_default_minutes_per_question numeric NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.test_timer_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.test_timer_settings TO authenticated;
GRANT ALL ON public.test_timer_settings TO service_role;

ALTER TABLE public.test_timer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read test timer settings"
  ON public.test_timer_settings FOR SELECT USING (true);

CREATE POLICY "Admins can insert test timer settings"
  ON public.test_timer_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update test timer settings"
  ON public.test_timer_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.test_timer_settings (min_minutes_per_question, max_minutes_per_question, auto_default_minutes_per_question)
VALUES (0.5, 3, 1);

ALTER TABLE public.revision_plan_days ADD COLUMN is_test boolean NOT NULL DEFAULT false;