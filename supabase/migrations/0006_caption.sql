-- Optional social caption/title for a meal post (separate from the food
-- `description` that drives AI analysis).
alter table meals add column if not exists caption text;
