-- 181: My Profile shows the user's roles, teams and governance roles; the Dashboard's
-- source filter offers only the user's own sources (or a chosen steward's, for the Data
-- Management Office). The texts for both, in Arabic too (see db/174).
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr181 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr181 (key_code, category_code, base_text, ar_text) VALUES
  ('profile.rolesTitle', 'UI_PROFILE', 'Roles', 'الأدوار'),
  ('profile.rolesDesc', 'UI_PROFILE', 'The platform roles assigned to you, directly or through a team, and what each one covers.', 'أدوار المنصة المسندة إليك مباشرةً أو عبر فريق، ونطاق كل دور.'),
  ('profile.noRoles', 'UI_PROFILE', 'No role is assigned to you.', 'لم يُسند إليك أي دور.'),
  ('profile.viaTeam', 'UI_PROFILE', 'via team', 'عبر فريق'),
  ('profile.teamsTitle', 'UI_PROFILE', 'Teams', 'الفرق'),
  ('profile.teamsDesc', 'UI_PROFILE', 'The teams you are a member of.', 'الفرق التي أنت عضو فيها.'),
  ('profile.noTeams', 'UI_PROFILE', 'You are not a member of any team.', 'لست عضواً في أي فريق.'),
  ('profile.members', 'UI_PROFILE', 'members', 'أعضاء'),
  ('profile.govTitle', 'UI_PROFILE', 'Data Sources & Governance Roles', 'مصادر البيانات وأدوار الحوكمة'),
  ('profile.govDesc', 'UI_PROFILE', 'The source systems, schemas and tables you hold a governance role on. Your dashboard statistics cover these sources.', 'الأنظمة المصدرية والمخططات والجداول التي لديك دور حوكمة عليها. إحصاءات لوحة المعلومات تغطي هذه المصادر.'),
  ('profile.noGov', 'UI_PROFILE', 'You hold no governance role on a data source.', 'ليس لديك دور حوكمة على أي مصدر بيانات.'),
  ('profile.govWholeSource', 'UI_PROFILE', 'The whole source system', 'النظام المصدري كاملاً'),
  ('profile.scopeTypes.GLOBAL', 'UI_PROFILE', 'All resources', 'جميع الموارد'),
  ('profile.scopeTypes.DATA_SOURCE', 'UI_PROFILE', 'Data source', 'مصدر بيانات'),
  ('profile.scopeTypes.SCHEMA', 'UI_PROFILE', 'Schema', 'مخطط'),
  ('profile.scopeTypes.TABLE', 'UI_PROFILE', 'Table', 'جدول'),
  ('profile.scopeTypes.DOMAIN', 'UI_PROFILE', 'Domain', 'مجال'),
  ('profile.govLevels.SOURCE', 'UI_PROFILE', 'Source', 'مصدر'),
  ('profile.govLevels.SCHEMA', 'UI_PROFILE', 'Schema', 'مخطط'),
  ('profile.govLevels.TABLE', 'UI_PROFILE', 'Table', 'جدول'),
  ('sourceStats.stewardMe', 'UI_SOURCESTATS', 'Me', 'أنا'),
  ('sourceStats.dashboardSubtitleOffice', 'UI_SOURCESTATS', 'The source systems you hold a governance role on. Choose a steward to see the sources they govern.', 'الأنظمة المصدرية التي لديك دور حوكمة عليها. اختر مشرفاً لعرض المصادر التي يشرف عليها.'),
  ('sourceStats.noOwnSourcesOffice', 'UI_SOURCESTATS', 'You hold no governance role on a source system. Choose a steward to see theirs, or open the Source Systems report for every source.', 'ليس لديك دور حوكمة على أي نظام مصدري. اختر مشرفاً لعرض مصادره، أو افتح تقرير الأنظمة المصدرية لعرض كل المصادر.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr181
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr181 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
