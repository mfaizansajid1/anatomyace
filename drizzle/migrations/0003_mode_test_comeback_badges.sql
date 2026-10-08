CREATE OR REPLACE FUNCTION public.award_mode_badges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF TG_TABLE_NAME = 'mcq_answers' AND NEW.is_correct THEN
    SELECT COUNT(*) INTO n FROM public.mcq_answers WHERE user_id = NEW.user_id AND is_correct;
    IF n >= 100 THEN INSERT INTO public.user_achievements (user_id, badge_id) VALUES (NEW.user_id, 'sharp_shooter') ON CONFLICT DO NOTHING; END IF;
  ELSIF TG_TABLE_NAME = 'practical_answers' AND NEW.is_correct THEN
    SELECT COUNT(*) INTO n FROM public.practical_answers WHERE user_id = NEW.user_id AND is_correct;
    IF n >= 100 THEN INSERT INTO public.user_achievements (user_id, badge_id) VALUES (NEW.user_id, 'anatomist') ON CONFLICT DO NOTHING; END IF;
  ELSIF TG_TABLE_NAME = 'study_activity' THEN
    SELECT COUNT(DISTINCT study_type) INTO n FROM public.study_activity
      WHERE user_id = NEW.user_id AND study_date = NEW.study_date AND study_type IN ('flashcard','practical','mcq');
    IF n >= 3 THEN INSERT INTO public.user_achievements (user_id, badge_id) VALUES (NEW.user_id, 'all_rounder') ON CONFLICT DO NOTHING; END IF;
  ELSIF TG_TABLE_NAME = 'test_results' THEN
    SELECT COUNT(*) INTO n FROM public.test_results WHERE user_id = NEW.user_id;
    IF n >= 5 THEN INSERT INTO public.user_achievements (user_id, badge_id) VALUES (NEW.user_id, 'exam_ready') ON CONFLICT DO NOTHING; END IF;
    IF NEW.total > 0 AND NEW.score >= NEW.total THEN
      INSERT INTO public.user_achievements (user_id, badge_id) VALUES (NEW.user_id, 'ace') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.award_comeback_badge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.last_study_date IS NOT NULL AND NEW.last_study_date IS NOT NULL
     AND NEW.last_study_date - OLD.last_study_date >= 7 THEN
    INSERT INTO public.user_achievements (user_id, badge_id) VALUES (NEW.user_id, 'comeback_kid') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_badges_mcq AFTER INSERT ON public.mcq_answers FOR EACH ROW EXECUTE FUNCTION public.award_mode_badges();
CREATE TRIGGER trg_badges_practical AFTER INSERT ON public.practical_answers FOR EACH ROW EXECUTE FUNCTION public.award_mode_badges();
CREATE TRIGGER trg_badges_activity AFTER INSERT OR UPDATE ON public.study_activity FOR EACH ROW EXECUTE FUNCTION public.award_mode_badges();
CREATE TRIGGER trg_badges_tests AFTER INSERT ON public.test_results FOR EACH ROW EXECUTE FUNCTION public.award_mode_badges();
CREATE TRIGGER trg_badge_comeback AFTER UPDATE OF last_study_date ON public.user_stats FOR EACH ROW EXECUTE FUNCTION public.award_comeback_badge();

-- Backfill for existing students
INSERT INTO public.user_achievements (user_id, badge_id)
SELECT user_id, 'sharp_shooter' FROM public.mcq_answers WHERE is_correct GROUP BY user_id HAVING COUNT(*) >= 100
ON CONFLICT DO NOTHING;
INSERT INTO public.user_achievements (user_id, badge_id)
SELECT user_id, 'anatomist' FROM public.practical_answers WHERE is_correct GROUP BY user_id HAVING COUNT(*) >= 100
ON CONFLICT DO NOTHING;
INSERT INTO public.user_achievements (user_id, badge_id)
SELECT DISTINCT user_id, 'all_rounder' FROM (
  SELECT user_id, study_date FROM public.study_activity WHERE study_type IN ('flashcard','practical','mcq')
  GROUP BY user_id, study_date HAVING COUNT(DISTINCT study_type) >= 3) s
ON CONFLICT DO NOTHING;
INSERT INTO public.user_achievements (user_id, badge_id)
SELECT user_id, 'exam_ready' FROM public.test_results GROUP BY user_id HAVING COUNT(*) >= 5
ON CONFLICT DO NOTHING;
INSERT INTO public.user_achievements (user_id, badge_id)
SELECT DISTINCT user_id, 'ace' FROM public.test_results WHERE total > 0 AND score >= total
ON CONFLICT DO NOTHING;