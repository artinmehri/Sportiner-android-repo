-- Remove product_events.received_at.
--
-- It was written by every producer and read by nothing: no query, no RPC, no
-- index, no application code. Because no producer ever sends occurred_at, the
-- column also held the same value as occurred_at and created_at on every row,
-- so it carried no information even in principle.
--
-- The column was already dropped from prod by hand on 2026-09-08, so on prod
-- this is a no-op that records the drop in migration history.
--
-- The functions that still named the column are redefined by
-- 20260911120000_drop_received_at_from_emit_product_event_v1.sql and
-- 20260914120000_drop_received_at_from_link_user_acquisition_v1.sql (#5). This
-- migration is timestamped after both so it applies in order behind them.
--
-- session_id is NOT dropped here. Its only reader
-- (get_analytics_dashboard_firebase_v1) could not be verified against the live
-- database, so removing it is deferred until that definition is confirmed.

alter table public.product_events
  drop column if exists received_at;
