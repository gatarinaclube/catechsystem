UPDATE "UserSettings" AS settings
SET "modulePreferencesJson" = (settings."modulePreferencesJson"::jsonb || '["titles"]'::jsonb)::text
FROM "User" AS users
WHERE users.id = settings."userId"
  AND users.role IN ('PREMIUM', 'ASSOCIADO_PREMIUM')
  AND settings."modulePreferencesJson" IS NOT NULL
  AND btrim(settings."modulePreferencesJson") <> ''
  AND jsonb_typeof(settings."modulePreferencesJson"::jsonb) = 'array'
  AND NOT (settings."modulePreferencesJson"::jsonb ? 'titles');
