-- Run AFTER deploying the Edge Function and storing these two secrets in Supabase Vault:
-- super_day_function_url = https://PROJECT.supabase.co/functions/v1/reminders
-- super_day_cron_secret = same random value as REMINDER_CRON_SECRET in Edge Function Secrets
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'super-day-reminders';
select cron.schedule('super-day-reminders', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'super_day_function_url' limit 1),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'super_day_cron_secret' limit 1)),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
