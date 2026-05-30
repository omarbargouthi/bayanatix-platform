-- Standardise governance_domains with bilingual names and descriptions from the
-- "Domain names standardization" Excel file.
-- Adds name_ar / description_ar, and refreshes the English display names / descriptions.

ALTER TABLE bayanat.governance_domains
  ADD COLUMN IF NOT EXISTS name_ar       TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT;

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Governance',
  domain_description = 'Establish policies and oversight.',
  name_ar            = 'حوكمة البيانات',
  description_ar     = 'وضع السياسات والرقابة.'
WHERE domain_code = 'DG';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Catalog',
  domain_description = 'Discover and understand data.',
  name_ar            = 'دليل البيانات',
  description_ar     = 'اكتشاف وفهم البيانات.'
WHERE domain_code = 'DCAT';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Quality',
  domain_description = 'Ensure reliable, accurate data.',
  name_ar            = 'جودة البيانات',
  description_ar     = 'ضمان موثوقية البيانات ودقتها.'
WHERE domain_code = 'DQ';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Operations',
  domain_description = 'Manage daily data processes.',
  name_ar            = 'عمليات البيانات',
  description_ar     = 'إدارة عمليات البيانات اليومية.'
WHERE domain_code = 'DOPS';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Content Mgmt.',
  domain_description = 'Manage unstructured data assets.',
  name_ar            = 'إدارة المحتوى',
  description_ar     = 'إدارة أصول البيانات غير المنظمة.'
WHERE domain_code = 'DCM';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Modeling',
  domain_description = 'Design the data blueprint.',
  name_ar            = 'نمذجة البيانات',
  description_ar     = 'تصميم المخطط البياني للبيانات.'
WHERE domain_code = 'DARC';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Master Data',
  domain_description = 'Manage core business entities.',
  name_ar            = 'البيانات الرئيسية',
  description_ar     = 'إدارة الكيانات التجارية الأساسية.'
WHERE domain_code = 'MDM';

UPDATE bayanat.governance_domains SET
  domain_name        = 'BI & Analytics',
  domain_description = 'Derive insights from data.',
  name_ar            = 'الذكاء والتحليلات',
  description_ar     = 'استخلاص الرؤى من البيانات.'
WHERE domain_code = 'BIA';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Sharing',
  domain_description = 'Enable secure data exchange.',
  name_ar            = 'مشاركة البيانات',
  description_ar     = 'تمكين تبادل البيانات الآمن.'
WHERE domain_code = 'DSH';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Value',
  domain_description = 'Maximize data''s business value.',
  name_ar            = 'قيمة البيانات',
  description_ar     = 'تعظيم القيمة التجارية للبيانات.'
WHERE domain_code = 'DV';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Open Data',
  domain_description = 'Publish data for the public.',
  name_ar            = 'البيانات المفتوحة',
  description_ar     = 'نشر البيانات للعموم.'
WHERE domain_code = 'OD';

UPDATE bayanat.governance_domains SET
  domain_name        = 'FOI Requests',
  domain_description = 'Ensure transparent access to information.',
  name_ar            = 'حرية المعلومات',
  description_ar     = 'ضمان الوصول الشفاف للمعلومات.'
WHERE domain_code = 'FOI';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Classification',
  domain_description = 'Categorize data by sensitivity.',
  name_ar            = 'تصنيف البيانات',
  description_ar     = 'تصنيف البيانات حسب الحساسية.'
WHERE domain_code = 'CLS';

UPDATE bayanat.governance_domains SET
  domain_name        = 'Data Privacy',
  domain_description = 'Safeguard individuals'' data rights.',
  name_ar            = 'خصوصية البيانات',
  description_ar     = 'حماية حقوق أفراد البيانات.'
WHERE domain_code = 'PDP';

UPDATE bayanat.governance_domains SET
  domain_name        = 'AI Governance',
  domain_description = 'Govern AI responsibly and ethically.',
  name_ar            = 'حوكمة الذكاء الاصطناعي',
  description_ar     = 'حوكمة الذكاء الاصطناعي بمسؤولية وأخلاقية.'
WHERE domain_code = 'AIG';
