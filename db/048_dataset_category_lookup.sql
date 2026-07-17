-- Migration 048: Move open-data dataset categories into the shared app_lookups table
-- so that admins can manage them from the configuration page.

-- 1. Seed the DATASET_CATEGORY lookup group with the 16 sector categories
INSERT INTO bayanat.app_lookups
  (lookup_group, lookup_code, lookup_label, label_ar, sort_order, is_active, is_system)
VALUES
  ('DATASET_CATEGORY', 'ECONOMY_FINANCE',            'Economy and Finance',            'الاقتصاد والمالية',                 1,  true, false),
  ('DATASET_CATEGORY', 'EDUCATION_TRAINING',          'Education and Training',          'التعليم والتدريب',                   2,  true, false),
  ('DATASET_CATEGORY', 'HEALTH_POPULATION',           'Health and Population',           'الصحة والسكان',                     3,  true, false),
  ('DATASET_CATEGORY', 'ENVIRONMENT_CLIMATE',         'Environment and Climate',         'البيئة والمناخ',                    4,  true, false),
  ('DATASET_CATEGORY', 'REAL_ESTATE_HOUSING',         'Real Estate and Housing',         'العقارات والإسكان',                 5,  true, false),
  ('DATASET_CATEGORY', 'TRANSPORTATION_LOGISTICS',    'Transportation and Logistics',    'النقل واللوجستيات',                 6,  true, false),
  ('DATASET_CATEGORY', 'GOVERNMENT_PUBLIC_SERVICES',  'Government and Public Services',  'الحكومة والخدمات العامة',           7,  true, false),
  ('DATASET_CATEGORY', 'DEMOGRAPHICS_SOCIAL',         'Demographics and Social',         'التركيبة السكانية والاجتماعية',     8,  true, false),
  ('DATASET_CATEGORY', 'AGRICULTURE_FOOD',            'Agriculture and Food',            'الزراعة والغذاء',                   9,  true, false),
  ('DATASET_CATEGORY', 'ENERGY_UTILITIES',            'Energy and Utilities',            'الطاقة والمرافق',                   10, true, false),
  ('DATASET_CATEGORY', 'SECURITY_SAFETY',             'Security and Safety',             'الأمن والسلامة',                    11, true, false),
  ('DATASET_CATEGORY', 'CULTURE_TOURISM',             'Culture and Tourism',             'الثقافة والسياحة',                  12, true, false),
  ('DATASET_CATEGORY', 'TECHNOLOGY_COMMUNICATIONS',   'Technology and Communications',   'التكنولوجيا والاتصالات',            13, true, false),
  ('DATASET_CATEGORY', 'INFRASTRUCTURE_CONSTRUCTION', 'Infrastructure and Construction', 'البنية التحتية والإنشاء',           14, true, false),
  ('DATASET_CATEGORY', 'LEGAL_JUDICIAL',              'Legal and Judicial',              'القانوني والقضائي',                 15, true, false),
  ('DATASET_CATEGORY', 'SCIENCE_RESEARCH',            'Science and Research',            'العلوم والبحث',                     16, true, false)
ON CONFLICT (lookup_group, lookup_code) DO NOTHING;

-- 2. Add category_code column to open_datasets
ALTER TABLE bayanat.open_datasets
  ADD COLUMN IF NOT EXISTS category_code VARCHAR(100);

-- 3. Migrate existing category_text values to category_code
UPDATE bayanat.open_datasets
SET category_code = CASE category_text
  WHEN 'Economy and Finance'             THEN 'ECONOMY_FINANCE'
  WHEN 'Education and Training'          THEN 'EDUCATION_TRAINING'
  WHEN 'Health and Population'           THEN 'HEALTH_POPULATION'
  WHEN 'Environment and Climate'         THEN 'ENVIRONMENT_CLIMATE'
  WHEN 'Real Estate and Housing'         THEN 'REAL_ESTATE_HOUSING'
  WHEN 'Transportation and Logistics'    THEN 'TRANSPORTATION_LOGISTICS'
  WHEN 'Government and Public Services'  THEN 'GOVERNMENT_PUBLIC_SERVICES'
  WHEN 'Demographics and Social'         THEN 'DEMOGRAPHICS_SOCIAL'
  WHEN 'Agriculture and Food'            THEN 'AGRICULTURE_FOOD'
  WHEN 'Energy and Utilities'            THEN 'ENERGY_UTILITIES'
  WHEN 'Security and Safety'             THEN 'SECURITY_SAFETY'
  WHEN 'Culture and Tourism'             THEN 'CULTURE_TOURISM'
  WHEN 'Technology and Communications'   THEN 'TECHNOLOGY_COMMUNICATIONS'
  WHEN 'Infrastructure and Construction' THEN 'INFRASTRUCTURE_CONSTRUCTION'
  WHEN 'Legal and Judicial'              THEN 'LEGAL_JUDICIAL'
  WHEN 'Science and Research'            THEN 'SCIENCE_RESEARCH'
  ELSE NULL
END
WHERE category_text IS NOT NULL AND category_code IS NULL;
