ALTER TABLE public.card_reviews
  ADD COLUMN IF NOT EXISTS ease_factor numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS interval_days numeric NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.record_card_review(_flashcard_id uuid, _rating text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  next_dt TIMESTAMPTZ;
  today DATE := (now() AT TIME ZONE 'UTC')::date;
  t_id UUID;
  t_name TEXT;
  cur_stats RECORD;
  new_streak INTEGER;
  new_today INTEGER;
  total_reviews INTEGER;
  good_reviews INTEGER;
  accuracy INTEGER;
  due_count INTEGER;
  week_count INTEGER;
  xp_gain INTEGER;
  cur_xp RECORD;
  new_total_xp INTEGER;
  new_level INTEGER;
  new_correct_streak INTEGER;
  cur_ef NUMERIC := 2.5;
  cur_iv NUMERIC := 1;
  new_ef NUMERIC;
  new_iv NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _rating NOT IN ('again','hard','good','easy') THEN RAISE EXCEPTION 'Invalid rating'; END IF;

  SELECT ease_factor, interval_days INTO cur_ef, cur_iv
  FROM public.card_reviews WHERE user_id = uid AND flashcard_id = _flashcard_id;
  cur_ef := COALESCE(cur_ef, 2.5);
  cur_iv := COALESCE(cur_iv, 1);

  IF _rating = 'again' THEN
    new_ef := GREATEST(1.3, cur_ef - 0.2);
    new_iv := 1;
    next_dt := now() + INTERVAL '10 minutes';
  ELSIF _rating = 'hard' THEN
    new_ef := GREATEST(1.3, cur_ef - 0.15);
    new_iv := cur_iv * 1.2;
    next_dt := now() + (new_iv || ' days')::interval;
  ELSIF _rating = 'good' THEN
    new_ef := cur_ef;
    new_iv := cur_iv * cur_ef;
    next_dt := now() + (new_iv || ' days')::interval;
  ELSE
    new_ef := cur_ef + 0.15;
    new_iv := cur_iv * cur_ef * 1.3;
    next_dt := now() + (new_iv || ' days')::interval;
  END IF;

  INSERT INTO public.card_reviews (user_id, flashcard_id, next_review_date, last_rating, review_count, ease_factor, interval_days)
  VALUES (uid, _flashcard_id, next_dt, _rating, 1, new_ef, new_iv)
  ON CONFLICT (user_id, flashcard_id) DO UPDATE
    SET next_review_date = EXCLUDED.next_review_date,
        last_rating = EXCLUDED.last_rating,
        review_count = public.card_reviews.review_count + 1,
        ease_factor = EXCLUDED.ease_factor,
        interval_days = EXCLUDED.interval_days,
        updated_at = now();

  INSERT INTO public.review_events (user_id, flashcard_id, rating)
  VALUES (uid, _flashcard_id, _rating);

  SELECT topic_id INTO t_id FROM public.flashcards WHERE id = _flashcard_id;
  SELECT name INTO t_name FROM public.topics WHERE id = t_id;

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

  IF t_id IS NOT NULL AND t_name IS NOT NULL THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE last_rating IN ('good','easy'))
      INTO total_reviews, good_reviews
    FROM public.card_reviews cr JOIN public.flashcards f ON f.id = cr.flashcard_id
    WHERE cr.user_id = uid AND f.topic_id = t_id;

    accuracy := CASE WHEN total_reviews = 0 THEN 0 ELSE ROUND((good_reviews::numeric / total_reviews) * 100) END;

    SELECT COUNT(*) INTO due_count
    FROM public.flashcards f LEFT JOIN public.card_reviews cr
      ON cr.flashcard_id = f.id AND cr.user_id = uid
    WHERE f.topic_id = t_id AND f.is_published = true
      AND (cr.next_review_date IS NULL OR cr.next_review_date <= now());

    INSERT INTO public.topic_performance (user_id, topic_name, accuracy_percentage, cards_due_count)
    VALUES (uid, t_name, accuracy, due_count)
    ON CONFLICT (user_id, topic_name) DO UPDATE
      SET accuracy_percentage = EXCLUDED.accuracy_percentage,
          cards_due_count = EXCLUDED.cards_due_count,
          updated_at = now();
  END IF;

  xp_gain := CASE _rating WHEN 'again' THEN 2 WHEN 'hard' THEN 5 ELSE 10 END;
  INSERT INTO public.user_xp (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  SELECT * INTO cur_xp FROM public.user_xp WHERE user_id = uid;
  new_total_xp := cur_xp.total_xp + xp_gain;
  new_level := GREATEST(1, (new_total_xp / 500) + 1);
  IF _rating IN ('good','easy') THEN
    new_correct_streak := cur_xp.current_correct_streak + 1;
  ELSE
    new_correct_streak := 0;
  END IF;
  UPDATE public.user_xp
    SET total_xp = new_total_xp,
        level = new_level,
        current_correct_streak = new_correct_streak,
        updated_at = now()
    WHERE user_id = uid;

  INSERT INTO public.user_achievements (user_id, badge_id)
  VALUES (uid, 'first_session') ON CONFLICT DO NOTHING;

  IF new_streak >= 7 THEN
    INSERT INTO public.user_achievements (user_id, badge_id)
    VALUES (uid, 'streak_7') ON CONFLICT DO NOTHING;
  END IF;

  IF (cur_stats.cards_studied_total + 1) >= 100 THEN
    INSERT INTO public.user_achievements (user_id, badge_id)
    VALUES (uid, 'century_100') ON CONFLICT DO NOTHING;
  END IF;

  IF new_correct_streak >= 10 THEN
    INSERT INTO public.user_achievements (user_id, badge_id)
    VALUES (uid, 'perfectionist_10') ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

UPDATE public.card_reviews
SET ease_factor = CASE last_rating
      WHEN 'again' THEN 2.3 WHEN 'hard' THEN 2.35 WHEN 'easy' THEN 2.65 ELSE 2.5 END,
    interval_days = CASE last_rating
      WHEN 'again' THEN 1 WHEN 'hard' THEN 1.2 WHEN 'good' THEN 3 WHEN 'easy' THEN 7 ELSE 1 END
WHERE last_rating IS NOT NULL;