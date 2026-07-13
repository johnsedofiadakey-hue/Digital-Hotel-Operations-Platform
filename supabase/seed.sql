-- Demo hotel for local development and the Sprint 1 exit test:
-- "scan a room QR and land in a full session; scan a vacant room and get
-- outcome B; check-in upgrades the open page live." (§15)

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Stormglide Demo Hotels');

insert into branches (id, organization_id, name, code) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Accra Pilot', 'ACCRA');

update branches set
  wifi_info = 'Network "AccraPilot-Guest", password on your room key card.',
  directions = 'Off the Spintex Road roundabout, look for the blue Stormglide sign.',
  house_rules = 'Check-out 11:00. No smoking indoors. Quiet hours 22:00-07:00.'
where id = '00000000-0000-0000-0000-000000000010';

insert into room_categories (id, branch_id, name, request_priority_default) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Standard', 'normal'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'Deluxe Suite', 'high');

-- room_key is left to its default (random hex) except for one fixed demo
-- room, so there's a stable QR URL to test against without querying the DB
-- for the generated key every time.
insert into rooms (id, branch_id, category_id, room_key, label, status) values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000100', 'demo0000000000000000000000101a', '101', 'vacant_clean'),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000100', default, '102', 'vacant_clean'),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000100', default, '103', 'vacant_dirty'),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000101', default, '201', 'vacant_clean'),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000101', default, '202', 'out_of_order');

-- One active stay on room 101 — the "scan and land in a full session" case.
-- Room 102 stays vacant on purpose — the "scan and get outcome B" case.
insert into stays (id, room_id, branch_id, state, last_names, phone, checkin_at, checkout_due) values
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000001001',
   '00000000-0000-0000-0000-000000000010', 'active', array['Mensah'], '+233200000000',
   now() - interval '1 hour', now() + interval '2 days');

-- Sprint 3 demo menu — one section visible to every room category, one
-- restricted to Deluxe Suite (§7.3 "menu per room category") so
-- category-driven visibility has something real to test against.
insert into menu_sections (id, branch_id, name, room_category_id, sort_order) values
  ('00000000-0000-0000-0000-000000030001', '00000000-0000-0000-0000-000000000010', 'All-Day Menu', null, 1),
  ('00000000-0000-0000-0000-000000030002', '00000000-0000-0000-0000-000000000010', 'Suite Room Service',
   '00000000-0000-0000-0000-000000000101', 2);

insert into menu_items (id, section_id, branch_id, name, description, price_minor_units, available, sort_order) values
  ('00000000-0000-0000-0000-000000031001', '00000000-0000-0000-0000-000000030001', '00000000-0000-0000-0000-000000000010',
   'Jollof Rice', 'With grilled chicken', 2500, true, 1),
  ('00000000-0000-0000-0000-000000031002', '00000000-0000-0000-0000-000000030001', '00000000-0000-0000-0000-000000000010',
   'Grilled Tilapia', 'Served with banku', 3500, true, 2),
  ('00000000-0000-0000-0000-000000031003', '00000000-0000-0000-0000-000000030001', '00000000-0000-0000-0000-000000000010',
   'Bottled Water', '750ml', 500, true, 3),
  ('00000000-0000-0000-0000-000000031004', '00000000-0000-0000-0000-000000030002', '00000000-0000-0000-0000-000000000010',
   'Club Sandwich', 'Triple-decker', 4000, true, 1),
  ('00000000-0000-0000-0000-000000031005', '00000000-0000-0000-0000-000000030002', '00000000-0000-0000-0000-000000000010',
   'Champagne', 'Bottle', 15000, true, 2);
