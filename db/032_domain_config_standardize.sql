-- Update gov_compliance_domain_config with standardised names and descriptions
-- sourced from the "Domain names standardization" Excel file.
-- Uses short Menu Names (EN/AR) and 4-word Key Messages (EN/AR) as descriptions.

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Governance',
  name_ar        = 'حوكمة البيانات',
  description_en = 'Establish policies and oversight.',
  description_ar = 'وضع السياسات والرقابة.'
WHERE domain_code = 'DG';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Catalog',
  name_ar        = 'دليل البيانات',
  description_en = 'Discover and understand data.',
  description_ar = 'اكتشاف وفهم البيانات.'
WHERE domain_code = 'MCM';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Quality',
  name_ar        = 'جودة البيانات',
  description_en = 'Ensure reliable, accurate data.',
  description_ar = 'ضمان موثوقية البيانات ودقتها.'
WHERE domain_code = 'DQ';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Operations',
  name_ar        = 'عمليات البيانات',
  description_en = 'Manage daily data processes.',
  description_ar = 'إدارة عمليات البيانات اليومية.'
WHERE domain_code = 'DO';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Content Mgmt.',
  name_ar        = 'إدارة المحتوى',
  description_en = 'Manage unstructured data assets.',
  description_ar = 'إدارة أصول البيانات غير المنظمة.'
WHERE domain_code = 'DCM';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Modeling',
  name_ar        = 'نمذجة البيانات',
  description_en = 'Design the data blueprint.',
  description_ar = 'تصميم المخطط البياني للبيانات.'
WHERE domain_code = 'DAM';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Master Data',
  name_ar        = 'البيانات الرئيسية',
  description_en = 'Manage core business entities.',
  description_ar = 'إدارة الكيانات التجارية الأساسية.'
WHERE domain_code = 'RMD';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'BI & Analytics',
  name_ar        = 'الذكاء والتحليلات',
  description_en = 'Derive insights from data.',
  description_ar = 'استخلاص الرؤى من البيانات.'
WHERE domain_code = 'BIA';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Sharing',
  name_ar        = 'مشاركة البيانات',
  description_en = 'Enable secure data exchange.',
  description_ar = 'تمكين تبادل البيانات الآمن.'
WHERE domain_code = 'DSI';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Value',
  name_ar        = 'قيمة البيانات',
  description_en = 'Maximize data''s business value.',
  description_ar = 'تعظيم القيمة التجارية للبيانات.'
WHERE domain_code = 'DVR';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Open Data',
  name_ar        = 'البيانات المفتوحة',
  description_en = 'Publish data for the public.',
  description_ar = 'نشر البيانات للعموم.'
WHERE domain_code = 'OD';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'FOI Requests',
  name_ar        = 'حرية المعلومات',
  description_en = 'Ensure transparent access to information.',
  description_ar = 'ضمان الوصول الشفاف للمعلومات.'
WHERE domain_code = 'FOI';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Classification',
  name_ar        = 'تصنيف البيانات',
  description_en = 'Categorize data by sensitivity.',
  description_ar = 'تصنيف البيانات حسب الحساسية.'
WHERE domain_code = 'DC';

UPDATE bayanat.gov_compliance_domain_config SET
  name_en        = 'Data Privacy',
  name_ar        = 'خصوصية البيانات',
  description_en = 'Safeguard individuals'' data rights.',
  description_ar = 'حماية حقوق أفراد البيانات.'
WHERE domain_code = 'PDP';
