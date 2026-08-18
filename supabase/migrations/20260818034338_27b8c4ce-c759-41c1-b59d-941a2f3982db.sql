CREATE TABLE public.clinical_mcqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  explanation text,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_mcqs TO authenticated;
GRANT ALL ON public.clinical_mcqs TO service_role;
ALTER TABLE public.clinical_mcqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users view published mcqs" ON public.clinical_mcqs
  FOR SELECT TO authenticated USING (is_published OR is_admin());
CREATE POLICY "Admins insert mcqs" ON public.clinical_mcqs
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins update mcqs" ON public.clinical_mcqs
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins delete mcqs" ON public.clinical_mcqs
  FOR DELETE TO authenticated USING (is_admin());

CREATE TRIGGER clinical_mcqs_set_updated_at BEFORE UPDATE ON public.clinical_mcqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mcq_timer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_seconds integer NOT NULL DEFAULT 10,
  max_seconds integer NOT NULL DEFAULT 60,
  auto_default_seconds integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.mcq_timer_settings TO authenticated;
GRANT ALL ON public.mcq_timer_settings TO service_role;
ALTER TABLE public.mcq_timer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users view timer settings" ON public.mcq_timer_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert timer settings" ON public.mcq_timer_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins update timer settings" ON public.mcq_timer_settings
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER mcq_timer_settings_set_updated_at BEFORE UPDATE ON public.mcq_timer_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.mcq_timer_settings (min_seconds, max_seconds, auto_default_seconds)
VALUES (10, 60, 30);

CREATE OR REPLACE FUNCTION public.record_mcq_answer(_mcq_id uuid, _is_correct boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date;
  t_name text;
  cur_stats RECORD;
  new_streak integer;
  new_today integer;
  week_count integer;
  xp_gain integer;
  cur_xp RECORD;
  new_total_xp integer;
  new_level integer;
  new_correct_streak integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT t.name INTO t_name
  FROM public.clinical_mcqs m
  JOIN public.categories c ON c.id = m.category_id
  JOIN public.topics t ON t.id = c.topic_id
  WHERE m.id = _mcq_id;

  INSERT INTO public.user_stats (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  SELECT * INTO cur_stats FROM public.user_stats WHERE user_id = uid;

  IF cur_stats.last_study_date IS NULL THEN new_streak := 1;
  ELSIF cur_stats.last_study_date = today THEN new_streak := GREATEST(cur_stats.current_streak, 1);
  ELSIF cur_stats.last_study_date = today - 1 THEN new_streak := cur_stats.current_streak + 1;
  ELSE new_streak := 1;
  END IF;

  IF cur_stats.last_study_date = today THEN new_today := cur_stats.cards_studied_today + 1;
  ELSE new_today := 1;
  END IF;

  INSERT INTO public.study_activity (user_id, study_date, cards_studied)
  VALUES (uid, today, 1)
  ON CONFLICT (user_id, study_date) DO UPDATE
    SET cards_studied = public.study_activity.cards_studied + 1;

  SELECT COALESCE(SUM(cards_studied),0) INTO week_count
  FROM public.study_activity WHERE user_id = uid AND study_date > today - 7;

  UPDATE public.user_stats
    SET cards_studied_today = new_today,
        cards_studied_total = cards_studied_total + 1,
        cards_studied_this_week = week_count,
        current_streak = new_streak,
        longest_streak = GREATEST(longest_streak, new_streak),
        last_study_date = today,
        last_topic_studied = COALESCE(t_name, last_topic_studied),
        updated_at = now()
    WHERE user_id = uid;

  xp_gain := CASE WHEN _is_correct THEN 10 ELSE 2 END;
  INSERT INTO public.user_xp (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  SELECT * INTO cur_xp FROM public.user_xp WHERE user_id = uid;
  new_total_xp := cur_xp.total_xp + xp_gain;
  new_level := GREATEST(1, (new_total_xp / 500) + 1);
  IF _is_correct THEN new_correct_streak := cur_xp.current_correct_streak + 1;
  ELSE new_correct_streak := 0; END IF;

  UPDATE public.user_xp
    SET total_xp = new_total_xp,
        level = new_level,
        current_correct_streak = new_correct_streak,
        updated_at = now()
    WHERE user_id = uid;

  INSERT INTO public.user_achievements (user_id, badge_id)
  VALUES (uid, 'first_session') ON CONFLICT DO NOTHING;

  IF new_streak >= 7 THEN
    INSERT INTO public.user_achievements (user_id, badge_id) VALUES (uid, 'streak_7') ON CONFLICT DO NOTHING;
  END IF;
  IF (cur_stats.cards_studied_total + 1) >= 100 THEN
    INSERT INTO public.user_achievements (user_id, badge_id) VALUES (uid, 'century_100') ON CONFLICT DO NOTHING;
  END IF;
  IF new_correct_streak >= 10 THEN
    INSERT INTO public.user_achievements (user_id, badge_id) VALUES (uid, 'perfectionist_10') ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;