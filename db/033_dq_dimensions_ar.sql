-- Add Arabic name and description columns to dq_dimensions
ALTER TABLE bayanat.dq_dimensions
  ADD COLUMN IF NOT EXISTS name_ar_text        TEXT,
  ADD COLUMN IF NOT EXISTS description_ar_text TEXT;

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'اكتمال البيانات',
  description_ar_text = 'قياس نسبة البيانات الموجودة وغير الفارغة.'
WHERE dimension_code = 'COMP';

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'دقة البيانات',
  description_ar_text = 'درجة تمثيل البيانات للكيان الحقيقي بشكل صحيح.'
WHERE dimension_code = 'ACCURACY';

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'اتساق البيانات',
  description_ar_text = 'اتساق قيم البيانات عبر مجموعات البيانات والأنظمة المختلفة.'
WHERE dimension_code = 'CONSISTENCY';

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'صحة البيانات',
  description_ar_text = 'مطابقة البيانات للصيغ والأنواع والقيم المسموح بها.'
WHERE dimension_code = 'VALIDITY';

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'حداثة البيانات',
  description_ar_text = 'البيانات محدّثة وتم تحديثها ضمن النافذة الزمنية المتوقعة.'
WHERE dimension_code = 'FRESHNESS';

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'مطابقة المعايير',
  description_ar_text = 'التزام البيانات بالمعايير والمخططات الداخلية والخارجية.'
WHERE dimension_code = 'CONFORMITY';

UPDATE bayanat.dq_dimensions SET
  name_ar_text        = 'تفرد البيانات',
  description_ar_text = 'عدم وجود سجلات أو قيم مكررة حيث يُشترط التفرد.'
WHERE dimension_code = 'UNIQUENESS';
