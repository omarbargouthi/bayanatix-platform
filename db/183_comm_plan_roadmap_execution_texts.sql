-- 183: Arabic for the Governance Framework's new sections (Operating Model, Communication
-- Plan), hiding a section, the Communication Plan's schedule, roadmap execution, and what
-- the Dashboard's announcements say about events and milestones (see db/174).
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('UI_COMMPLAN', 'Communication Plan', 'UI'),
  ('UI_ROADMAPEXEC', 'Roadmap Execution', 'UI')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr183 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr183 (key_code, category_code, base_text, ar_text) VALUES
  ('governance.sectionLabels.operatingModel', 'UI_GOVERNANCE', 'Operating Model', 'النموذج التشغيلي'),
  ('governance.sectionLabels.communication', 'UI_GOVERNANCE', 'Communication Plan', 'خطة التواصل'),
  ('governance.sectionDescs.operatingModel', 'UI_GOVERNANCE', 'The data governance operating model: organisational structure, roles and responsibilities, committees and decision rights.', 'النموذج التشغيلي لحوكمة البيانات: الهيكل التنظيمي والأدوار والمسؤوليات واللجان وصلاحيات اتخاذ القرار.'),
  ('governance.sectionDescs.communication', 'UI_GOVERNANCE', 'The communication plan: scheduled training and awareness sessions, updates on policies, procedures, strategy and roadmap, key events and announcements.', 'خطة التواصل: جلسات التدريب والتوعية المجدولة، وتحديثات السياسات والإجراءات والاستراتيجية وخارطة الطريق، والفعاليات الرئيسية والإعلانات.'),
  ('governance.fw.formDomain', 'UI_GOVERNANCE', 'Domain', 'المجال'),
  ('governance.fw.domainHint', 'UI_GOVERNANCE', 'What this roadmap is for — metadata, data quality, or any other domain.', 'ما تخصّه خارطة الطريق: البيانات الوصفية أو جودة البيانات أو أي مجال آخر.'),
  ('governance.fw.domainOptions', 'UI_GOVERNANCE', 'Data Governance, Metadata, Data Quality, Data Privacy, Data Sharing, Master Data, Data Architecture, Open Data', 'حوكمة البيانات، البيانات الوصفية، جودة البيانات، خصوصية البيانات، مشاركة البيانات، البيانات الرئيسية، هيكلة البيانات، البيانات المفتوحة'),
  ('governance.fw.colDomain', 'UI_GOVERNANCE', 'Domain', 'المجال'),
  ('governance.fw.colExecution', 'UI_GOVERNANCE', 'Execution', 'التنفيذ'),
  ('governance.fw.hideSection', 'UI_GOVERNANCE', 'Hide', 'إخفاء'),
  ('governance.fw.showSection', 'UI_GOVERNANCE', 'Show', 'إظهار'),
  ('governance.fw.hiddenBadge', 'UI_GOVERNANCE', 'Hidden', 'مخفي'),
  ('governance.fw.hiddenNote', 'UI_GOVERNANCE', 'A hidden section is not shown to other users and nothing in it is announced on the dashboard. Its documents are kept, and it can be shown again at any time.', 'القسم المخفي لا يظهر لبقية المستخدمين ولا يُعلن عن محتواه في لوحة المعلومات. تبقى وثائقه محفوظة ويمكن إظهاره في أي وقت.'),
  ('governance.fw.sectionHiddenBanner', 'UI_GOVERNANCE', 'This section is hidden. Only those who manage Data Governance can see it.', 'هذا القسم مخفي، ولا يراه إلا من يدير حوكمة البيانات.'),
  ('governance.fw.upcomingEvents', 'UI_GOVERNANCE', 'upcoming events', 'فعاليات قادمة'),
  ('announcements.kinds.OPERATING_MODEL', 'UI_ANNOUNCEMENTS', 'Operating model', 'النموذج التشغيلي'),
  ('announcements.kinds.COMMUNICATION', 'UI_ANNOUNCEMENTS', 'Communication', 'تواصل'),
  ('announcements.kinds.ROADMAP', 'UI_ANNOUNCEMENTS', 'Roadmap', 'خارطة الطريق'),
  ('announcements.dueOn', 'UI_ANNOUNCEMENTS', 'Due {date}', 'الاستحقاق {date}'),
  ('announcements.completedOn', 'UI_ANNOUNCEMENTS', 'Completed {date}', 'اكتمل في {date}'),
  ('announcements.emptyManage', 'UI_ANNOUNCEMENTS', 'Nothing is being announced. Upcoming events of the Communication Plan and roadmap milestones appear here, and so does a document that comes into effect within 90 days, was approved in the last 30 days, or has “Show on the dashboard” ticked in the Governance Framework.', 'لا توجد إعلانات حالياً. تظهر هنا الفعاليات القادمة في خطة التواصل والمراحل الرئيسية لخرائط الطريق، وكذلك الوثيقة التي يبدأ سريانها خلال 90 يوماً، أو التي اعتُمدت خلال آخر 30 يوماً، أو التي فُعّل لها خيار «العرض في لوحة التحكم» في إطار الحوكمة.'),
  ('commPlan.scheduleTitle', 'UI_COMMPLAN', 'Schedule', 'الجدول الزمني'),
  ('commPlan.scheduleDesc', 'UI_COMMPLAN', 'Training and awareness sessions, updates on policies, procedures, strategy and roadmap, key events and announcements.', 'جلسات التدريب والتوعية، وتحديثات السياسات والإجراءات والاستراتيجية وخارطة الطريق، والفعاليات الرئيسية والإعلانات.'),
  ('commPlan.plansTitle', 'UI_COMMPLAN', 'Plan documents', 'وثائق الخطة'),
  ('commPlan.addEvent', 'UI_COMMPLAN', '+ Add Event', '+ إضافة فعالية'),
  ('commPlan.newEvent', 'UI_COMMPLAN', 'Add Event', 'إضافة فعالية'),
  ('commPlan.editEvent', 'UI_COMMPLAN', 'Edit Event', 'تعديل الفعالية'),
  ('commPlan.upcoming', 'UI_COMMPLAN', 'Upcoming', 'القادمة'),
  ('commPlan.past', 'UI_COMMPLAN', 'Past, held and cancelled', 'السابقة والمنعقدة والملغاة'),
  ('commPlan.noEvents', 'UI_COMMPLAN', 'Nothing is scheduled yet. Add the sessions, updates and key events of the communication plan.', 'لا توجد فعاليات مجدولة بعد. أضف جلسات خطة التواصل وتحديثاتها وفعالياتها الرئيسية.'),
  ('commPlan.noUpcoming', 'UI_COMMPLAN', 'No upcoming events.', 'لا توجد فعاليات قادمة.'),
  ('commPlan.onDashboard', 'UI_COMMPLAN', 'On the dashboard', 'في لوحة المعلومات'),
  ('commPlan.fTitle', 'UI_COMMPLAN', 'Title', 'العنوان'),
  ('commPlan.fType', 'UI_COMMPLAN', 'Type', 'النوع'),
  ('commPlan.fStatus', 'UI_COMMPLAN', 'Status', 'الحالة'),
  ('commPlan.fDate', 'UI_COMMPLAN', 'Date', 'التاريخ'),
  ('commPlan.fEndDate', 'UI_COMMPLAN', 'End date', 'تاريخ الانتهاء'),
  ('commPlan.endDateHint', 'UI_COMMPLAN', 'Only for an event that runs over several days.', 'للفعالية التي تمتد لعدة أيام فقط.'),
  ('commPlan.fTime', 'UI_COMMPLAN', 'Time', 'الوقت'),
  ('commPlan.fLocation', 'UI_COMMPLAN', 'Location or link', 'المكان أو الرابط'),
  ('commPlan.locationHint', 'UI_COMMPLAN', 'A room, or the link to the online meeting.', 'قاعة، أو رابط الاجتماع عبر الإنترنت.'),
  ('commPlan.fAudience', 'UI_COMMPLAN', 'Audience', 'الفئة المستهدفة'),
  ('commPlan.audiencePlaceholder', 'UI_COMMPLAN', 'e.g. Data stewards', 'مثال: مشرفو البيانات'),
  ('commPlan.fChannel', 'UI_COMMPLAN', 'Channel', 'قناة التواصل'),
  ('commPlan.channelPlaceholder', 'UI_COMMPLAN', 'e.g. E-mail, town hall', 'مثال: البريد الإلكتروني، لقاء عام'),
  ('commPlan.fDescription', 'UI_COMMPLAN', 'Description', 'الوصف'),
  ('commPlan.announceLabel', 'UI_COMMPLAN', 'Show on the dashboard', 'العرض في لوحة المعلومات'),
  ('commPlan.announceHint', 'UI_COMMPLAN', 'Advertised to everyone in the Dashboard''s announcements while it is planned and takes place within the next 90 days.', 'تُعلن للجميع ضمن إعلانات لوحة المعلومات ما دامت مخططة وتنعقد خلال التسعين يوماً القادمة.'),
  ('commPlan.titleRequired', 'UI_COMMPLAN', 'A title is required.', 'العنوان مطلوب.'),
  ('commPlan.dateRequired', 'UI_COMMPLAN', 'A date is required.', 'التاريخ مطلوب.'),
  ('commPlan.saveFailed', 'UI_COMMPLAN', 'The event could not be saved.', 'تعذّر حفظ الفعالية.'),
  ('commPlan.deleteConfirm', 'UI_COMMPLAN', 'Delete this event?', 'حذف هذه الفعالية؟'),
  ('commPlan.types.TRAINING', 'UI_COMMPLAN', 'Training session', 'جلسة تدريبية'),
  ('commPlan.types.AWARENESS', 'UI_COMMPLAN', 'Awareness session', 'جلسة توعوية'),
  ('commPlan.types.POLICY_UPDATE', 'UI_COMMPLAN', 'Policy update', 'تحديث سياسة'),
  ('commPlan.types.PROCEDURE_UPDATE', 'UI_COMMPLAN', 'Procedure update', 'تحديث إجراء'),
  ('commPlan.types.STRATEGY_UPDATE', 'UI_COMMPLAN', 'Strategy update', 'تحديث الاستراتيجية'),
  ('commPlan.types.ROADMAP_UPDATE', 'UI_COMMPLAN', 'Roadmap update', 'تحديث خارطة الطريق'),
  ('commPlan.types.KEY_EVENT', 'UI_COMMPLAN', 'Key event', 'فعالية رئيسية'),
  ('commPlan.types.ANNOUNCEMENT', 'UI_COMMPLAN', 'Announcement', 'إعلان'),
  ('commPlan.statuses.PLANNED', 'UI_COMMPLAN', 'Planned', 'مخططة'),
  ('commPlan.statuses.DONE', 'UI_COMMPLAN', 'Held', 'انعقدت'),
  ('commPlan.statuses.CANCELLED', 'UI_COMMPLAN', 'Cancelled', 'ملغاة'),
  ('roadmapExec.title', 'UI_ROADMAPEXEC', 'Execution', 'التنفيذ'),
  ('roadmapExec.progress', 'UI_ROADMAPEXEC', '{done} of {total} completed', 'اكتمل {done} من {total}'),
  ('roadmapExec.noItems', 'UI_ROADMAPEXEC', 'No milestones or deliverables yet. Add them to track how the roadmap is being executed.', 'لا توجد مراحل رئيسية أو مخرجات بعد. أضفها لمتابعة تنفيذ خارطة الطريق.'),
  ('roadmapExec.addMilestone', 'UI_ROADMAPEXEC', '+ Milestone', '+ مرحلة رئيسية'),
  ('roadmapExec.addDeliverable', 'UI_ROADMAPEXEC', '+ Deliverable', '+ مخرج'),
  ('roadmapExec.otherDeliverables', 'UI_ROADMAPEXEC', 'Other deliverables', 'مخرجات أخرى'),
  ('roadmapExec.overdue', 'UI_ROADMAPEXEC', 'Overdue', 'متأخر'),
  ('roadmapExec.onDashboard', 'UI_ROADMAPEXEC', 'On the dashboard', 'في لوحة المعلومات'),
  ('roadmapExec.due', 'UI_ROADMAPEXEC', 'Due {date}', 'الاستحقاق {date}'),
  ('roadmapExec.completed', 'UI_ROADMAPEXEC', 'Completed {date}', 'اكتمل في {date}'),
  ('roadmapExec.fTitle', 'UI_ROADMAPEXEC', 'Title', 'العنوان'),
  ('roadmapExec.fMilestone', 'UI_ROADMAPEXEC', 'Under milestone', 'ضمن المرحلة الرئيسية'),
  ('roadmapExec.noMilestone', 'UI_ROADMAPEXEC', '— None (directly on the roadmap) —', '— بدون (على خارطة الطريق مباشرة) —'),
  ('roadmapExec.fStatus', 'UI_ROADMAPEXEC', 'Status', 'الحالة'),
  ('roadmapExec.fOwner', 'UI_ROADMAPEXEC', 'Owner', 'المسؤول'),
  ('roadmapExec.fDue', 'UI_ROADMAPEXEC', 'Due date', 'تاريخ الاستحقاق'),
  ('roadmapExec.fCompleted', 'UI_ROADMAPEXEC', 'Completed on', 'تاريخ الاكتمال'),
  ('roadmapExec.completedHint', 'UI_ROADMAPEXEC', 'Left empty, today is recorded.', 'إذا تُرك فارغاً يُسجَّل تاريخ اليوم.'),
  ('roadmapExec.fDescription', 'UI_ROADMAPEXEC', 'Description', 'الوصف'),
  ('roadmapExec.announceLabel', 'UI_ROADMAPEXEC', 'Show on the dashboard', 'العرض في لوحة المعلومات'),
  ('roadmapExec.announceHint', 'UI_ROADMAPEXEC', 'Advertised in the Dashboard''s announcements when it is due within 90 days, and for 30 days after it is completed.', 'يُعلن ضمن إعلانات لوحة المعلومات عندما يحين استحقاقه خلال 90 يوماً، ولمدة 30 يوماً بعد اكتماله.'),
  ('roadmapExec.titleRequired', 'UI_ROADMAPEXEC', 'A title is required.', 'العنوان مطلوب.'),
  ('roadmapExec.saveFailed', 'UI_ROADMAPEXEC', 'The item could not be saved.', 'تعذّر حفظ العنصر.'),
  ('roadmapExec.deleteConfirm', 'UI_ROADMAPEXEC', 'Delete this item? A milestone''s deliverables are deleted with it.', 'حذف هذا العنصر؟ تُحذف مخرجات المرحلة الرئيسية معها.'),
  ('roadmapExec.types.MILESTONE', 'UI_ROADMAPEXEC', 'Milestone', 'مرحلة رئيسية'),
  ('roadmapExec.types.DELIVERABLE', 'UI_ROADMAPEXEC', 'Deliverable', 'مخرج'),
  ('roadmapExec.dialogTitles.NEW_MILESTONE', 'UI_ROADMAPEXEC', 'Add Milestone', 'إضافة مرحلة رئيسية'),
  ('roadmapExec.dialogTitles.EDIT_MILESTONE', 'UI_ROADMAPEXEC', 'Edit Milestone', 'تعديل المرحلة الرئيسية'),
  ('roadmapExec.dialogTitles.NEW_DELIVERABLE', 'UI_ROADMAPEXEC', 'Add Deliverable', 'إضافة مخرج'),
  ('roadmapExec.dialogTitles.EDIT_DELIVERABLE', 'UI_ROADMAPEXEC', 'Edit Deliverable', 'تعديل المخرج'),
  ('roadmapExec.statuses.NOT_STARTED', 'UI_ROADMAPEXEC', 'Not started', 'لم يبدأ'),
  ('roadmapExec.statuses.IN_PROGRESS', 'UI_ROADMAPEXEC', 'In progress', 'قيد التنفيذ'),
  ('roadmapExec.statuses.COMPLETED', 'UI_ROADMAPEXEC', 'Completed', 'مكتمل'),
  ('roadmapExec.statuses.DELAYED', 'UI_ROADMAPEXEC', 'Delayed', 'متأخر'),
  ('roadmapExec.statuses.ON_HOLD', 'UI_ROADMAPEXEC', 'On hold', 'معلّق'),
  ('roadmapExec.statuses.CANCELLED', 'UI_ROADMAPEXEC', 'Cancelled', 'ملغى'),
  ('roadmapExec.execStatuses.NOT_TRACKED', 'UI_ROADMAPEXEC', 'Not tracked', 'غير متابَع'),
  ('roadmapExec.execStatuses.NOT_STARTED', 'UI_ROADMAPEXEC', 'Not started', 'لم يبدأ'),
  ('roadmapExec.execStatuses.IN_PROGRESS', 'UI_ROADMAPEXEC', 'In progress', 'قيد التنفيذ'),
  ('roadmapExec.execStatuses.DELAYED', 'UI_ROADMAPEXEC', 'Behind schedule', 'متأخر عن الجدول'),
  ('roadmapExec.execStatuses.COMPLETED', 'UI_ROADMAPEXEC', 'Completed', 'مكتمل');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr183
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr183 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
