-- NDI 2026's directory_type (Evidence Type) has 14 real raw values with no
-- matching EVIDENCE_TYPE config item (confirmed live: ~55 of 518 requirement
-- rows), including a whitespace-variant duplicate of an already-configured
-- value ("مؤشر/تقرير تحسين" vs the existing "مؤشر/ تقرير تحسين"). Each gets
-- the same two-part treatment as the 12 existing EVIDENCE_TYPE items: a
-- compliance_config_items row (English label, Arabic code kept in label_ar
-- for consistency with existing rows though unused by getConfigItems) plus
-- a matching translation_keys/translations row so the Arabic UI continues
-- showing the same original Arabic text while English resolves to a real
-- label instead of raw Arabic.

DO $$
DECLARE
  item record;
  new_item_id integer;
  new_key_id integer;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('مؤشر/تقرير تحسين',             'KPI / Improvement Report',       13),
    ('إجراءات',                      'Procedures',                     14),
    ('نموذج',                        'Form',                           15),
    ('عملية',                        'Process',                        16),
    ('مؤشر',                         'KPI / Indicator',                17),
    ('سياسة',                        'Policy',                         18),
    ('هيكل',                         'Structure',                      19),
    ('عينة',                         'Sample',                         20),
    ('عمليات',                       'Processes',                      21),
    ('معايير',                       'Standards',                      22),
    ('الية',                         'Mechanism',                      23),
    ('تقرير بطاقات أداء Scorecard',  'Performance Scorecard Report',   24),
    ('مستند',                        'Document',                       25),
    ('اتفاقية مستوى خدمة SLA',       'Service Level Agreement (SLA)',  26)
  ) AS t(code, label, sort_order)
  LOOP
    INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, sort_order)
    VALUES (1, 'EVIDENCE_TYPE', item.code, item.label, item.code, item.sort_order)
    ON CONFLICT (framework_id, config_group, code) DO NOTHING
    RETURNING item_id INTO new_item_id;

    IF new_item_id IS NOT NULL THEN
      INSERT INTO bayanat.translation_keys (category_code, key_code, base_text, base_language_code)
      VALUES ('LIST_COMPLIANCE_CONFIG', 'list.compliance_config.1.EVIDENCE_TYPE.' || item.code, item.label, 'en')
      ON CONFLICT (key_code) DO NOTHING
      RETURNING key_id INTO new_key_id;

      IF new_key_id IS NOT NULL THEN
        INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code)
        VALUES (new_key_id, 'ar', item.code, 'VERIFIED');
      END IF;
    END IF;
    new_item_id := NULL;
    new_key_id := NULL;
  END LOOP;
END $$;
