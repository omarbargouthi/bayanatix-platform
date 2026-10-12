-- 176: Arabic for the Governance page's "Maturity by Domain" section and for deleting a
-- register. New texts in lib/i18n/en.ts need their key and Arabic in the translations
-- table as well (see db/174).
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr176 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr176 (key_code, category_code, base_text, ar_text) VALUES
  ('governance.maturity.title', 'UI_GOVERNANCE', 'Maturity by Domain', 'النضج حسب المجال'),
  ('governance.maturity.desc', 'UI_GOVERNANCE', 'The maturity level of each domain, for every regulation assessed on a maturity scale.', 'مستوى نضج كل مجال، لكل لائحة تُقيَّم وفق مقياس نضج.'),
  ('governance.maturity.overall', 'UI_GOVERNANCE', 'Overall maturity', 'النضج الإجمالي'),
  ('governance.maturity.openAssessment', 'UI_GOVERNANCE', 'Open assessment', 'فتح التقييم'),
  ('governance.maturity.standardsAssessed', 'UI_GOVERNANCE', '{done} of {total} standards assessed', 'تم تقييم {done} من {total} معيار'),
  ('governance.maturity.none', 'UI_GOVERNANCE', 'No regulation is assessed on a maturity scale yet.', 'لا توجد لائحة تُقيَّم وفق مقياس نضج بعد.'),
  ('governance.maturity.noDomains', 'UI_GOVERNANCE', 'This regulation has no domains with maturity standards yet.', 'لا توجد مجالات تتضمن معايير نضج لهذه اللائحة بعد.'),
  ('registers.archiveTitle', 'UI_REGISTERS', 'Delete Register', 'حذف السجل'),
  ('registers.archiveIntro', 'UI_REGISTERS', '“{name}” will be removed from the registers list.', 'ستتم إزالة «{name}» من قائمة السجلات.'),
  ('registers.archiveWhat', 'UI_REGISTERS', 'What happens:', 'ما الذي سيحدث:'),
  ('registers.archiveKept', 'UI_REGISTERS', 'The register and its {n} entries are kept, not erased', 'يُحتفظ بالسجل وإدخالاته البالغ عددها {n} ولا تُمحى'),
  ('registers.archiveHidden', 'UI_REGISTERS', 'Users no longer see this register', 'لن يرى المستخدمون هذا السجل بعد الآن'),
  ('registers.archiveAudit', 'UI_REGISTERS', 'Administrators can still open it under “Deleted Registers” for audit', 'يمكن للمسؤولين فتحه من «السجلات المحذوفة» لأغراض التدقيق'),
  ('registers.archiveRestore', 'UI_REGISTERS', 'It can be restored at any time', 'يمكن استعادته في أي وقت'),
  ('registers.archiveSystemNote', 'UI_REGISTERS', 'This is a built-in register. Delete it only if your organisation does not use it.', 'هذا سجل مضمَّن في النظام. احذفه فقط إذا كانت جهتك لا تستخدمه.'),
  ('registers.archiveConfirm', 'UI_REGISTERS', 'Delete Register', 'حذف السجل'),
  ('registers.archiving', 'UI_REGISTERS', 'Deleting…', 'جارٍ الحذف…'),
  ('registers.archivedHeading', 'UI_REGISTERS', 'Deleted Registers ({n})', 'السجلات المحذوفة ({n})'),
  ('registers.archivedBy', 'UI_REGISTERS', 'Deleted By', 'حذفه'),
  ('registers.archivedAt', 'UI_REGISTERS', 'Deleted At', 'تاريخ الحذف'),
  ('registers.auditView', 'UI_REGISTERS', 'Audit View', 'عرض التدقيق'),
  ('registers.restore', 'UI_REGISTERS', 'Restore', 'استعادة'),
  ('registers.nameCol', 'UI_REGISTERS', 'Name', 'الاسم'),
  ('registers.deleteFailed', 'UI_REGISTERS', 'The register could not be deleted.', 'تعذّر حذف السجل.'),
  ('registers.registerNamePlaceholder', 'UI_REGISTERS', 'e.g. Risk Register', 'مثال: سجل المخاطر');

UPDATE bayanat.translations t
SET status_code = 'STALE'
FROM bayanat.translation_keys tk
JOIN _tr176 n ON n.key_code = tk.key_code
WHERE t.key_id = tk.key_id AND tk.base_text <> n.base_text
  AND t.language_code <> 'ar' AND t.status_code <> 'MISSING';

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr176
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr176 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
