-- Second-device manual entry (§4.5): "g.dhop.app -> enter property room code
-- (e.g. ACCRA-204) + last name." The room_key on `rooms` is opaque by design
-- (§4.2) — it can't be the thing a guest types in by hand. This adds the
-- short, globally-unique, human-typeable branch code that combines with
-- rooms.label to form that code ("ACCRA" + "-" + "204").
--
-- Globally unique (not just per-organization): the manual-entry endpoint
-- lives on a single shared domain (g.dhop.app) with no per-hotel subpath, so
-- two branches on the platform can never collide on the same code.
alter table branches add column code text;

update branches set code = 'ACCRA' where name = 'Accra Pilot';

alter table branches alter column code set not null;
alter table branches add constraint branches_code_format check (code ~ '^[A-Z0-9]+$');
alter table branches add constraint branches_code_unique unique (code);
