-- Run the completion processor every five minutes.

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'sportiner-game-completion'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'sportiner-game-completion',
    '*/5 * * * *',
    'select private.process_game_completion_v1();'
  );
end;
$$;
