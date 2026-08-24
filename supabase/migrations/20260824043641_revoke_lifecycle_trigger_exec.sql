-- Trigger entrypoints and the internal resolution helper are not public RPCs.

revoke all on function public.emit_game_created_event_v1() from public, anon, authenticated;
revoke all on function public.emit_game_joined_event_v1() from public, anon, authenticated;
revoke all on function public.emit_onboarding_events_v1() from public, anon, authenticated;
revoke all on function public.game_resolution_state(public.games) from public, anon, authenticated;
