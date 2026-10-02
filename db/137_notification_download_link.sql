-- Job-completion notifications can now carry a direct link to the file the job
-- produced (bulk download workbook, compliance/report/translations export), shown
-- under the notification next to "View Job Details" so the user doesn't have to
-- go find the job row first.

ALTER TABLE bayanat.notifications
  ADD COLUMN IF NOT EXISTS download_href  text,
  ADD COLUMN IF NOT EXISTS download_label text;

-- Backfill existing notifications. They only record the job id inside the body
-- text ("Job #N finished successfully."), and bulk_jobs / background_jobs have
-- separate id sequences, so action_href is what tells the two apart.

UPDATE bayanat.notifications n
SET download_href = '/api/bulk/jobs/' || j.job_id || '/file', download_label = j.file_name_text
FROM bayanat.bulk_jobs j
WHERE n.type = 'JOB'
  AND n.download_href IS NULL
  AND n.action_href = '/bulk-operations?tab=jobs'
  AND n.title = 'Bulk Download completed'
  AND n.body = 'Job #' || j.job_id || ' finished successfully.'
  AND n.user_id = j.created_by_user_id
  AND j.job_type_code = 'DOWNLOAD'
  AND j.file_data IS NOT NULL;

UPDATE bayanat.notifications n
SET download_href = '/api/jobs/' || j.job_id || '/file', download_label = j.result_file_name
FROM bayanat.background_jobs j
WHERE n.type = 'JOB'
  AND n.download_href IS NULL
  AND n.action_href = '/admin/audit-logs?tab=job-logs'
  AND n.title LIKE '% completed'
  AND n.body = 'Job #' || j.job_id || ' finished successfully.'
  AND n.user_id = j.created_by_user_id
  AND j.result_file_data IS NOT NULL;
