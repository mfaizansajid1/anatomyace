CREATE TABLE public.revision_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type text NOT NULL DEFAULT 'custom',
  mode text NOT NULL DEFAULT 'auto',
  start_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_plans TO authenticated;
GRANT ALL ON public.revision_plans TO service_role;
ALTER TABLE public.revision_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own revision plans" ON public.revision_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.revision_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.revision_plans(id) ON DELETE CASCADE,
  day_number integer NOT NULL,
  plan_date date NOT NULL,
  subtopic_id uuid REFERENCES public.subtopics(id) ON DELETE SET NULL,
  target_card_count integer NOT NULL DEFAULT 20,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_plan_days TO authenticated;
GRANT ALL ON public.revision_plan_days TO service_role;
ALTER TABLE public.revision_plan_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own revision plan days" ON public.revision_plan_days FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.revision_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.revision_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE INDEX idx_revision_plan_days_plan ON public.revision_plan_days(plan_id);
CREATE TRIGGER trg_revision_plans_updated BEFORE UPDATE ON public.revision_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_revision_plan_days_updated BEFORE UPDATE ON public.revision_plan_days FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();