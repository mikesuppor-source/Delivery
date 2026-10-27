-- 019: Driver push notification subscriptions for background locked-screen alerts
CREATE TABLE IF NOT EXISTS public.driver_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_push_subs_driver_id 
  ON public.driver_push_subscriptions(driver_id);
