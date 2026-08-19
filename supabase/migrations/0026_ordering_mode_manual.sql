-- A third way to sequence a round: the officer arranges it by hand.
--
-- Alone in its own migration on purpose. ALTER TYPE ... ADD VALUE may run inside a transaction,
-- but the new label cannot be *used* until that transaction commits — so anything referring to
-- 'manual' has to live in a later file.

alter type public.ordering_mode add value if not exists 'manual';
