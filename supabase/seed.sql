-- Task Studio — seed med tre opdigtede projekter.
--
-- ############################################################
-- #  ADVARSEL: FØRSTE LINJE ER «delete from node».           #
-- #  Den sletter ALT — også rigtige projekter, logposter,    #
-- #  blokeringer, beslutninger, rapporter og dokumentrækker. #
-- #  Filer i storage bliver liggende som forældreløse.       #
-- #                                                          #
-- #  Basen er i drift med rigtige data siden 2. sept. 2026.  #
-- #  Kør ALDRIG denne fil mod den.                           #
-- ############################################################
--
-- Filen er bevaret som forlæg: den viser hvordan et fuldt udfyldt
-- projekttræ ser ud, og kan køres mod en tom testbase.
--
-- Alle datoer er relative til current_date, så data ikke forældes.

delete from node;

-- ===========================================================================
-- 1. CAPEX — Ny CT-scanner til frøkvalitetskontrol
-- ===========================================================================
insert into node (id, parent_id, type, title, description, category, status, owner, start_date, due_date, is_milestone, sort_order, reporting) values
  ('11111111-0000-4000-8000-000000000001', null, 'project', 'Ny CT-scanner til frøkvalitetskontrol',
   'Erstatning af den manuelle stikprøvekontrol med CT-baseret gennemlysning af frøpartier.',
   'capex', 'active', 'Produktionschef', current_date - 62, current_date + 75, false, 10,
   '{"project_no": "CX-2601", "account": "1200-4410", "portfolio": "Anlæg"}'::jsonb);

insert into node (id, parent_id, type, title, category, status, owner, start_date, due_date, completed_at, is_milestone, sort_order) values
  ('11111111-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'subproject', 'Indkøb og godkendelse', 'capex', 'active',  null, current_date - 62, current_date + 5,  null, false, 10),
  ('11111111-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'subproject', 'Installation',         'capex', 'planned', null, current_date + 20, current_date + 45, null, false, 20),
  ('11111111-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000001', 'subproject', 'Validering',           'capex', 'planned', null, current_date + 46, current_date + 70, null, false, 30);

insert into node (id, parent_id, type, title, category, status, owner, due_date, completed_at, is_milestone, sort_order) values
  ('11111111-0000-4000-8000-000000000111', '11111111-0000-4000-8000-000000000011', 'task', 'Kravspecifikation godkendt',        'capex', 'done',    null,          current_date - 40, now() - interval '41 days', true,  10),
  ('11111111-0000-4000-8000-000000000112', '11111111-0000-4000-8000-000000000011', 'task', 'Indhent tre tilbud',                'capex', 'done',    null,          current_date - 18, now() - interval '16 days', false, 20),
  ('11111111-0000-4000-8000-000000000113', '11111111-0000-4000-8000-000000000011', 'task', 'Investeringsansøgning til ledelsen','capex', 'blocked', 'Ledelsen',    current_date + 5,  null,                       true,  30),
  ('11111111-0000-4000-8000-000000000121', '11111111-0000-4000-8000-000000000012', 'task', 'Klargøring af scannerrum',          'capex', 'planned', null,          current_date + 30, null,                       false, 10),
  ('11111111-0000-4000-8000-000000000122', '11111111-0000-4000-8000-000000000012', 'task', 'Levering og opstilling',            'capex', 'planned', 'Leverandør',  current_date + 45, null,                       true,  20),
  ('11111111-0000-4000-8000-000000000123', '11111111-0000-4000-8000-000000000012', 'task', 'El, trykluft og strålingsafskærmning','capex','planned', null,          current_date + 38, null,                       false, 30),
  ('11111111-0000-4000-8000-000000000131', '11111111-0000-4000-8000-000000000013', 'task', 'Testprotokol udarbejdet',           'capex', 'planned', null,          current_date + 60, null,                       false, 10),
  ('11111111-0000-4000-8000-000000000132', '11111111-0000-4000-8000-000000000013', 'task', 'FAT og SAT gennemført',             'capex', 'planned', null,          current_date + 70, null,                       true,  20);

-- ===========================================================================
-- 2. PRODUKTION — Automatisk vejecellekalibrering, pakkelinje 2
-- ===========================================================================
insert into node (id, parent_id, type, title, description, category, status, owner, start_date, due_date, is_milestone, sort_order, reporting) values
  ('22222222-0000-4000-8000-000000000001', null, 'project', 'Automatisk vejecellekalibrering, pakkelinje 2',
   'Kalibrering køres i dag manuelt hver morgen. Automatiseres via PLC og logges direkte.',
   'production', 'active', 'Linjeansvarlig', current_date - 30, current_date + 28, false, 20,
   '{"project_no": "PR-2614", "account": "1200-3120", "portfolio": "Drift"}'::jsonb);

insert into node (id, parent_id, type, title, category, status, due_date, completed_at, is_milestone, sort_order) values
  ('22222222-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000001', 'task',       'Kortlæg nuværende kalibreringsrutine', 'production', 'done',    current_date - 22, now() - interval '23 days', false, 10),
  ('22222222-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000001', 'task',       'Vælg vejeceller og leverandør',        'production', 'done',    current_date - 12, now() - interval '11 days', false, 20),
  ('22222222-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000001', 'subproject', 'Montering og integration',             'production', 'active',  current_date + 18, null,                       false, 30),
  ('22222222-0000-4000-8000-000000000014', '22222222-0000-4000-8000-000000000001', 'task',       'Oplæring af operatører',               'production', 'planned', current_date + 25, null,                       false, 40);

insert into node (id, parent_id, type, title, category, status, due_date, is_milestone, sort_order) values
  ('22222222-0000-4000-8000-000000000131', '22222222-0000-4000-8000-000000000013', 'task', 'Mekanisk montage',              'production', 'active',  current_date + 10, false, 10),
  ('22222222-0000-4000-8000-000000000132', '22222222-0000-4000-8000-000000000013', 'task', 'PLC-integration og testkørsel', 'production', 'planned', current_date + 18, true,  20);

-- ===========================================================================
-- 3. IT — Dataplatform til scannedata
-- ===========================================================================
insert into node (id, parent_id, type, title, description, category, status, owner, start_date, due_date, is_milestone, sort_order, reporting) values
  ('33333333-0000-4000-8000-000000000001', null, 'project', 'Dataplatform til scannedata',
   'Scanninger ligger i dag lokalt på arbejdsstationen. Skal centraliseres, så resultater kan følges over tid.',
   'it', 'blocked', 'IT', current_date - 48, current_date + 40, false, 30,
   '{"project_no": "IT-2609", "account": "1200-5200", "portfolio": "Digitalisering"}'::jsonb);

insert into node (id, parent_id, type, title, category, status, owner, due_date, completed_at, is_milestone, sort_order) values
  ('33333333-0000-4000-8000-000000000011', '33333333-0000-4000-8000-000000000001', 'task', 'Datamodel for scanninger',      'it', 'done',    null, current_date - 26, now() - interval '25 days', false, 10),
  ('33333333-0000-4000-8000-000000000012', '33333333-0000-4000-8000-000000000001', 'task', 'Serveradgang og VLAN',          'it', 'blocked', 'IT', current_date - 3,  null,                       false, 20),
  ('33333333-0000-4000-8000-000000000013', '33333333-0000-4000-8000-000000000001', 'task', 'ETL fra scanner til database',  'it', 'planned', null, current_date + 21, null,                       true,  30),
  ('33333333-0000-4000-8000-000000000014', '33333333-0000-4000-8000-000000000001', 'task', 'Dashboard v1',                  'it', 'idea',    null, null,              null,                       false, 40);

-- ===========================================================================
-- Blokeringer
-- ===========================================================================
insert into blocker (node_id, title, waiting_on, waiting_on_type, opened_at, expected_by, resolved_at, resolution) values
  ('33333333-0000-4000-8000-000000000012', 'Afventer VLAN og serveradgang',        'IT',          'internal_it',  current_date - 34, current_date - 10, null, null),
  ('11111111-0000-4000-8000-000000000113', 'Investeringsansøgning ikke behandlet', 'Ledelsen',    'management',   current_date - 12, current_date + 5,  null, null),
  ('11111111-0000-4000-8000-000000000012', 'Afklaring af gulvbelastning i hal 3',  'Vedligehold',       'external',     current_date - 6,  current_date + 4,  null, null),
  ('22222222-0000-4000-8000-000000000013', 'Vejeceller i restordre',               'Leverandør',  'vendor',       current_date - 21, current_date - 7,  current_date - 4, 'Delleverance modtaget. Resten bekræftet til uge 38.'),
  ('33333333-0000-4000-8000-000000000011', 'Manglende svar på datastruktur',       'IT',          'internal_it',  current_date - 45, current_date - 38, current_date - 29, 'Afklaret på møde. Vi bruger én tabel pr. scanningstype.');

-- ===========================================================================
-- Beslutninger
-- ===========================================================================
insert into decision (node_id, decided_on, decision, rationale, alternatives) values
  ('11111111-0000-4000-8000-000000000001', current_date - 35,
   'Vælger 130 kV røntgenkilde frem for 90 kV',
   'De tunge frøtyper kræver mere gennemtrængning end 90 kV giver. Ellers skal vi scanne to gange pr. parti.',
   'Fravalgt: 90 kV til 240 tkr. mindre. Dobbeltscanning ville koste mere i tid over to år.'),
  ('33333333-0000-4000-8000-000000000001', current_date - 40,
   'Bygger på eksisterende Postgres frem for ny SQL-server',
   'Ingen ny licens, ingen ny driftsaftale, og IT skal kun åbne for en adgang i stedet for at drifte en server.',
   'Fravalgt: dedikeret MSSQL. Kortere vej gennem IT vejer tungere end værktøjsvalget.'),
  ('22222222-0000-4000-8000-000000000001', current_date - 14,
   'Genbruger eksisterende PLC på linje 2',
   'Der er ledige indgange nok, og operatørerne kender panelet i forvejen.',
   'Fravalgt: separat controller. Ville give endnu et system at vedligeholde.');

-- ===========================================================================
-- Arbejdslog
-- ===========================================================================
insert into entry (node_id, entry_date, kind, body) values
  ('11111111-0000-4000-8000-000000000001', current_date - 16, 'work',    'Tredje tilbud modtaget. Prisspændet er 1,4-1,9 mio.'),
  ('11111111-0000-4000-8000-000000000001', current_date - 12, 'meeting', 'Gennemgang af tilbud med produktionschefen. Enige om at gå videre med leverandør B.'),
  ('11111111-0000-4000-8000-000000000113', current_date - 12, 'risk',    'Investeringsansøgningen er sendt, men ledelsesmødet er udskudt til uge 38.'),
  ('11111111-0000-4000-8000-000000000012', current_date - 6,  'note',    'Gulvet i hal 3 er ikke dokumenteret for 2,8 tons punktlast. Vedligehold undersøger.'),
  ('11111111-0000-4000-8000-000000000001', current_date - 3,  'work',    'Layoutforslag til scannerrummet tegnet op. Kræver flytning af to paller.'),

  ('22222222-0000-4000-8000-000000000131', current_date - 9,  'work',    'Beslag til vejeceller tilpasset på værkstedet.'),
  ('22222222-0000-4000-8000-000000000013', current_date - 4,  'note',    'Restordre delvist løst. To celler mangler stadig.'),
  ('22222222-0000-4000-8000-000000000131', current_date - 2,  'work',    'Fire af seks celler monteret. Resten når delleverancen kommer.'),
  ('22222222-0000-4000-8000-000000000001', current_date - 1,  'meeting', 'Kort snak med linjeansvarlig om oplæring. Bedst mellem to skiftehold.'),

  ('33333333-0000-4000-8000-000000000012', current_date - 20, 'risk',    'Stadig ingen VLAN. Projektet kan ikke komme videre uden.'),
  ('33333333-0000-4000-8000-000000000001', current_date - 11, 'work',    'ETL-logikken skrevet færdig lokalt, så den kan sættes i drift samme dag adgangen kommer.'),
  ('33333333-0000-4000-8000-000000000012', current_date - 5,  'note',    'Rykket IT igen. Henvist til næste change-vindue.'),
  ('33333333-0000-4000-8000-000000000001', current_date - 2,  'note',    'Overvejer at køre ETL fra arbejdsstationen midlertidigt, så vi ikke taber data imens.');

-- ===========================================================================
-- En tidligere ugerapport, så "siden sidst" har et holdepunkt
-- ===========================================================================
insert into report (node_id, period_start, period_end, fields, body_markdown, submitted, generated_at) values
  ('11111111-0000-4000-8000-000000000001', current_date - 11, current_date - 7,
   '{"status_text": "Tilbud indhentet fra tre leverandører. Valg af leverandør B aftalt med produktionschefen.", "progress_pct": 13, "next_milestone": "Investeringsansøgning til ledelsen", "risks": "Manglende svar fra IT på datastruktur er lukket. Ingen nye blokeringer på scannerprojektet."}'::jsonb,
   'Tilbud indhentet fra tre leverandører. Valg af leverandør B aftalt med produktionschefen.',
   true, now() - interval '7 days');
