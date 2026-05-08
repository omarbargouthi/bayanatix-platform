create schema if not exists bayanat;

-- Sequence referenced explicitly later in the DDL (declared first to avoid forward reference).
create sequence if not exists bayanat.business_glossary_glossary_id_seq
    increment 1 start 1 minvalue 1 maxvalue 2147483647 cache 1;

-- ===== Functions and procedures (declared first to avoid forward references in triggers) =====
-- DROP FUNCTION bayanat.fn_audit_metadata_changes();

CREATE OR REPLACE FUNCTION bayanat.fn_audit_metadata_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_audit_id INTEGER;
    v_column_name TEXT;
    v_old_val TEXT;
    v_new_val TEXT;
BEGIN
    -- 1. Create the parent Audit Entry
    -- We assume 'session_user' for the user_id, but this can be linked to your app user
    INSERT INTO audit_logs (action_type_code, asset_type_code, asset_id, user_id)
    VALUES (TG_OP, TG_TABLE_NAME, (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END), session_user)
    RETURNING audit_id INTO v_audit_id;

    -- 2. If it's an UPDATE, compare columns to find changes
    IF (TG_OP = 'UPDATE') THEN
        FOR v_column_name IN 
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = TG_TABLE_NAME 
            AND table_schema = TG_TABLE_SCHEMA
        LOOP
            EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_column_name, v_column_name)
            USING OLD, NEW
            INTO v_old_val, v_new_val;

            -- Only log if the value actually changed (handling NULLs safely)
            IF (v_old_val IS DISTINCT FROM v_new_val) THEN
                INSERT INTO history_logs (audit_id, field_name_text, old_value_text, new_value_text)
                VALUES (v_audit_id, v_column_name, v_old_val, v_new_val);
            END IF;
        END LOOP;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$
;

COMMENT ON FUNCTION bayanat.fn_audit_metadata_changes() IS 'Generic function to capture field-level changes and log them into audit_logs and history_logs.';

-- DROP FUNCTION bayanat.fn_generate_advanced_profile_sql(int4, text, text, text, int4);

CREATE OR REPLACE FUNCTION bayanat.fn_generate_advanced_profile_sql(p_connection_id integer, p_table_name text, p_column_name text, p_data_type text, p_sample_percent integer DEFAULT 10)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_db_type VARCHAR(20);
    v_sql TEXT;
    v_sample_clause TEXT;
BEGIN
    SELECT db_type_code INTO v_db_type FROM connection_registry WHERE connection_id = p_connection_id;

    -- Define Sampling Clause per Technology
    v_sample_clause := CASE 
        WHEN v_db_type = 'POSTGRES' THEN 'TABLESAMPLE SYSTEM (' || p_sample_percent || ')'
        WHEN v_db_type = 'ORACLE'   THEN 'SAMPLE(' || p_sample_percent || ')'
        WHEN v_db_type = 'MSSQL'    THEN 'TABLESAMPLE (' || p_sample_percent || ' PERCENT)'
        ELSE '' -- MySQL/others might require a different approach or no sampling
    END;

    -- Build the Mega-Query (Standard SQL compatible with most)
    v_sql := 'WITH base_data AS (SELECT ' || p_column_name || ' AS col FROM ' || p_table_name || ' ' || v_sample_clause || '),
              stats AS (
                SELECT 
                    COUNT(*) as total_rows,
                    COUNT(col) as non_nulls,
                    COUNT(DISTINCT col) as distincts,
                    MIN(col) as min_v,
                    MAX(col) as max_v';

    -- Add Numeric Specifics if applicable
    IF p_data_type IN ('numeric', 'integer', 'float', 'decimal', 'NUMBER', 'INT') THEN
        v_sql := v_sql || ', AVG(col) as mean_v, STDDEV(col) as std_v ';
    ELSE
        v_sql := v_sql || ', NULL as mean_v, NULL as std_v ';
    END IF;

    -- Add String Pattern analysis (Postgres/Oracle syntax shown, MSSQL would vary)
    v_sql := v_sql || ' FROM base_data)
              SELECT * FROM stats;';

    RETURN v_sql;
END;
$function$
;

-- DROP FUNCTION bayanat.fn_get_downstream_impact(int4, varchar);

CREATE OR REPLACE FUNCTION bayanat.fn_get_downstream_impact(p_asset_id integer, p_scope_code character varying)
 RETURNS TABLE(impact_level integer, downstream_asset_id integer, transformation_logic text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH RECURSIVE impact_path AS (
        -- Anchor: Find immediate downstream targets of our asset
        SELECT 
            1 as depth,
            target_asset_id,
            transformation_logic_text
        FROM data_lineage
        WHERE source_asset_id = p_asset_id
          AND lineage_scope_code = p_scope_code
        
        UNION ALL
        
        -- Recursive: Find targets of those targets
        SELECT 
            ip.depth + 1,
            dl.target_asset_id,
            dl.transformation_logic_text
        FROM data_lineage dl
        JOIN impact_path ip ON dl.source_asset_id = ip.target_asset_id
        WHERE dl.lineage_scope_code = p_scope_code
    )
    SELECT * FROM impact_path;
END;
$function$
;

COMMENT ON FUNCTION bayanat.fn_get_downstream_impact(int4, varchar) IS 'Recursively identifies all downstream assets impacted by a change to a specific source asset.';

-- DROP FUNCTION bayanat.fn_get_metadata_query(int4);

CREATE OR REPLACE FUNCTION bayanat.fn_get_metadata_query(p_connection_id integer)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_db_type VARCHAR(20);
    v_schema VARCHAR(100);
    v_query TEXT;
BEGIN
    -- 1. Identify the technology type and target schema
    SELECT db_type_code, default_schema 
    INTO v_db_type, v_schema
    FROM connection_registry 
    WHERE connection_id = p_connection_id;

    -- 2. Switch logic based on Database Engine
    CASE v_db_type
        WHEN 'POSTGRES' THEN
            v_query := 'SELECT table_name, column_name, data_type, is_nullable 
                        FROM information_schema.columns 
                        WHERE table_schema = ''' || v_schema || '''';
        
        WHEN 'MYSQL' THEN
            v_query := 'SELECT table_name, column_name, data_type, is_nullable 
                        FROM information_schema.columns 
                        WHERE table_schema = ''' || v_schema || '''';

        WHEN 'MSSQL' THEN
            v_query := 'SELECT t.name AS table_name, c.name AS column_name, 
                               ty.name AS data_type, 
                               CASE WHEN c.is_nullable = 1 THEN ''YES'' ELSE ''NO'' END
                        FROM sys.columns c
                        JOIN sys.tables t ON c.object_id = t.object_id
                        JOIN sys.types ty ON c.user_type_id = ty.user_type_id
                        JOIN sys.schemas s ON t.schema_id = s.schema_id
                        WHERE s.name = ''' || v_schema || '''';

        WHEN 'ORACLE' THEN
            v_query := 'SELECT table_name, column_name, data_type, nullable 
                        FROM all_tab_columns 
                        WHERE owner = ''' || v_schema || '''';

        ELSE
            RAISE EXCEPTION 'Unsupported Database Type: %', v_db_type;
    END CASE;

    RETURN v_query;
END;
$function$
;

-- DROP PROCEDURE bayanat.pr_build_view_lineage_v2(int4);

CREATE OR REPLACE PROCEDURE bayanat.pr_build_view_lineage_v2(IN p_connection_id integer)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    -- This inserts View-to-Table dependencies into YOUR data_lineage table
    INSERT INTO data_lineage (
        lineage_scope_code, 
        source_asset_id, 
        target_asset_id, 
        transformation_type_code, 
        transformation_logic_text,
        updated_by_user_id
    )
    SELECT 
        'ENTITY_LEVEL',     -- We are linking Table to View
        src.entity_id,      -- The Source Table ID
        tgt.entity_id,      -- The Target View ID
        'VIEW_DEFINITION',  -- Type of transformation
        'Auto-discovered via Postgres System Catalog',
        'SYSTEM_SCANNER'
    FROM dblink('host=localhost dbname=your_db', -- Update with dynamic conn string
        'SELECT DISTINCT 
             v.relname AS view_name, 
             t.relname AS tab_name 
         FROM pg_depend d
         JOIN pg_rewrite r ON d.objid = r.oid
         JOIN pg_class v ON r.ev_class = v.oid
         JOIN pg_class t ON d.refobjid = t.oid
         WHERE v.relkind = ''v'' AND t.relkind = ''r''') 
    AS remote(view_name TEXT, tab_name TEXT)
    JOIN data_entities tgt ON tgt.entity_name = remote.view_name
    JOIN data_entities src ON src.entity_name = remote.tab_name
    WHERE NOT EXISTS (
        SELECT 1 FROM data_lineage 
        WHERE source_asset_id = src.entity_id AND target_asset_id = tgt.entity_id
    );

    RAISE NOTICE 'Lineage built successfully in data_lineage table.';
END;
$procedure$
;

-- DROP PROCEDURE bayanat.pr_process_workflow_step(int4, varchar, varchar, text);

CREATE OR REPLACE PROCEDURE bayanat.pr_process_workflow_step(IN p_task_id integer, IN p_user_id character varying, IN p_action character varying, IN p_comment text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
v_curr_stage_id INTEGER;
v_next_stage_id INTEGER;
v_sla_days INTEGER;
BEGIN
-- 1. Identify current stage
SELECT current_stage_id INTO v_curr_stage_id FROM governance_tasks WHERE task_id = p_task_id;

-- 2. Find next stage based on action (Approve/Reject)
SELECT to_stage_id INTO v_next_stage_id 
FROM workflow_transitions 
WHERE from_stage_id = v_curr_stage_id AND action_result_code = p_action;

-- 3. Get SLA days for the NEW stage
SELECT sla_days_count INTO v_sla_days FROM workflow_stages WHERE stage_id = v_next_stage_id;

-- 4. Update the Task
UPDATE governance_tasks
SET current_stage_id = v_next_stage_id,
    current_stage_due_date = CURRENT_DATE + v_sla_days,
    status_code = CASE WHEN v_next_stage_id IS NULL THEN 'RESOLVED' ELSE 'IN_PROGRESS' END
WHERE task_id = p_task_id;

-- 5. Audit the change
INSERT INTO task_activity_logs (task_id, from_stage_id, to_stage_id, action_result_code, action_by_user_id)
VALUES (p_task_id, v_curr_stage_id, v_next_stage_id, p_action, p_user_id);

-- 6. Add comment to the thread
INSERT INTO task_comments (task_id, user_id, comment_text)
VALUES (p_task_id, p_user_id, p_comment);
END;
$procedure$
;

-- bayanat.asset_questions definition

-- Drop table

-- DROP TABLE bayanat.asset_questions;

CREATE TABLE bayanat.asset_questions (
	question_id serial4 NOT NULL, -- Unique surrogate identifier for the question.
	asset_type_code varchar(50) NOT NULL, -- The category of the asset (e.g., DATA_SOURCES, DATA_ATTRIBUTES).
	asset_id int4 NOT NULL, -- The primary key of the asset associated with the question.
	requester_user_id varchar(100) NOT NULL, -- The user ID of the person seeking clarification.
	question_text text NOT NULL, -- The content of the question being asked.
	status_code varchar(20) DEFAULT 'OPEN'::character varying NULL, -- Current lifecycle state (e.g., OPEN, ANSWERED, CLOSED).
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT asset_questions_pkey PRIMARY KEY (question_id)
);
COMMENT ON TABLE bayanat.asset_questions IS 'Tracks inquiries made by users regarding the definition, source, or usage of an asset.';

-- Column comments

COMMENT ON COLUMN bayanat.asset_questions.question_id IS 'Unique surrogate identifier for the question.';
COMMENT ON COLUMN bayanat.asset_questions.asset_type_code IS 'The category of the asset (e.g., DATA_SOURCES, DATA_ATTRIBUTES).';
COMMENT ON COLUMN bayanat.asset_questions.asset_id IS 'The primary key of the asset associated with the question.';
COMMENT ON COLUMN bayanat.asset_questions.requester_user_id IS 'The user ID of the person seeking clarification.';
COMMENT ON COLUMN bayanat.asset_questions.question_text IS 'The content of the question being asked.';
COMMENT ON COLUMN bayanat.asset_questions.status_code IS 'Current lifecycle state (e.g., OPEN, ANSWERED, CLOSED).';


-- bayanat.asset_reviews definition

-- Drop table

-- DROP TABLE bayanat.asset_reviews;

CREATE TABLE bayanat.asset_reviews (
	review_id serial4 NOT NULL, -- Unique surrogate identifier for the review.
	asset_type_code varchar(50) NOT NULL, -- The entity type being reviewed (e.g., DATA_ENTITIES, BUSINESS_GLOSSARIES).
	asset_id int4 NOT NULL, -- The primary key ID of the specific asset being rated.
	user_id varchar(100) NOT NULL, -- The identifier of the user providing the review.
	rating_score_number int4 NOT NULL, -- Numerical rating from 1 to 5 stars.
	review_text text NULL, -- Free-text qualitative feedback provided by the reviewer.
	is_anonymous_indicator bool DEFAULT false NULL, -- Flag indicating if the reviewer identity should be hidden from the public UI.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The date and time the review was submitted.
	CONSTRAINT asset_reviews_pkey PRIMARY KEY (review_id),
	CONSTRAINT asset_reviews_rating_score_number_check CHECK (((rating_score_number >= 1) AND (rating_score_number <= 5)))
);
COMMENT ON TABLE bayanat.asset_reviews IS 'Captures user-generated feedback and star ratings to provide a social trust score for catalog assets.';

-- Column comments

COMMENT ON COLUMN bayanat.asset_reviews.review_id IS 'Unique surrogate identifier for the review.';
COMMENT ON COLUMN bayanat.asset_reviews.asset_type_code IS 'The entity type being reviewed (e.g., DATA_ENTITIES, BUSINESS_GLOSSARIES).';
COMMENT ON COLUMN bayanat.asset_reviews.asset_id IS 'The primary key ID of the specific asset being rated.';
COMMENT ON COLUMN bayanat.asset_reviews.user_id IS 'The identifier of the user providing the review.';
COMMENT ON COLUMN bayanat.asset_reviews.rating_score_number IS 'Numerical rating from 1 to 5 stars.';
COMMENT ON COLUMN bayanat.asset_reviews.review_text IS 'Free-text qualitative feedback provided by the reviewer.';
COMMENT ON COLUMN bayanat.asset_reviews.is_anonymous_indicator IS 'Flag indicating if the reviewer identity should be hidden from the public UI.';
COMMENT ON COLUMN bayanat.asset_reviews.created_at_timestamp IS 'The date and time the review was submitted.';


-- bayanat.attribute_profile_results definition

-- Drop table

-- DROP TABLE bayanat.attribute_profile_results;

CREATE TABLE bayanat.attribute_profile_results (
	profile_id serial4 NOT NULL, -- Unique surrogate identifier for a specific profiling execution record.
	attribute_id int4 NOT NULL, -- Foreign key linking the profile results to the specific data attribute (column) in the catalog.
	scan_id int4 NOT NULL, -- Link to the scan history record that triggered this profiling task.
	total_row_count int8 NULL, -- Total number of rows processed in the sample (or full table) during the profile.
	non_null_count int8 NULL, -- Number of records containing a non-null value for this specific attribute.
	distinct_count int8 NULL, -- Count of unique values identified in the sample.
	uniqueness_percentage numeric(5, 2) NULL, -- The ratio of distinct values to total non-null rows (Distinct/Non-Null * 100). High scores indicate candidate keys.
	null_percentage numeric(5, 2) NULL, -- The ratio of missing values to total rows. High scores may indicate data quality issues or optional fields.
	min_length int4 NULL, -- The shortest string length identified in the column (for text-based types).
	max_length int4 NULL, -- The longest string length identified in the column (for text-based types).
	avg_length numeric(10, 2) NULL, -- The arithmetic mean of string lengths across all non-null records.
	min_value text NULL, -- The lowest alphanumeric or numeric value found in the column, stored as text for cross-type compatibility.
	max_value text NULL, -- The highest alphanumeric or numeric value found in the column.
	mean_value numeric(18, 4) NULL, -- The average value for numeric columns; used to identify the data center.
	std_dev_value numeric(18, 4) NULL, -- The standard deviation for numeric columns; used to detect data volatility and outliers.
	top_10_frequent_values jsonb NULL, -- JSON array of the 10 most common values and their respective frequencies (e.g., [{"val": "Active", "count": 500}]).
	pattern_distribution jsonb NULL, -- JSON map of regex pattern matches found during scanning to identify data formats like SSN, Emails, or IDs.
	quantile_data jsonb NULL, -- JSON object containing percentile distributions (P25, P50/Median, P75, P90) for numeric and date fields.
	profile_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The exact date and time when the profiling query was completed.
	CONSTRAINT attribute_profile_results_pkey PRIMARY KEY (profile_id)
);
COMMENT ON TABLE bayanat.attribute_profile_results IS 'Stores comprehensive point-in-time statistical snapshots, data quality signatures, and distribution analysis for column-level attributes.';

-- Column comments

COMMENT ON COLUMN bayanat.attribute_profile_results.profile_id IS 'Unique surrogate identifier for a specific profiling execution record.';
COMMENT ON COLUMN bayanat.attribute_profile_results.attribute_id IS 'Foreign key linking the profile results to the specific data attribute (column) in the catalog.';
COMMENT ON COLUMN bayanat.attribute_profile_results.scan_id IS 'Link to the scan history record that triggered this profiling task.';
COMMENT ON COLUMN bayanat.attribute_profile_results.total_row_count IS 'Total number of rows processed in the sample (or full table) during the profile.';
COMMENT ON COLUMN bayanat.attribute_profile_results.non_null_count IS 'Number of records containing a non-null value for this specific attribute.';
COMMENT ON COLUMN bayanat.attribute_profile_results.distinct_count IS 'Count of unique values identified in the sample.';
COMMENT ON COLUMN bayanat.attribute_profile_results.uniqueness_percentage IS 'The ratio of distinct values to total non-null rows (Distinct/Non-Null * 100). High scores indicate candidate keys.';
COMMENT ON COLUMN bayanat.attribute_profile_results.null_percentage IS 'The ratio of missing values to total rows. High scores may indicate data quality issues or optional fields.';
COMMENT ON COLUMN bayanat.attribute_profile_results.min_length IS 'The shortest string length identified in the column (for text-based types).';
COMMENT ON COLUMN bayanat.attribute_profile_results.max_length IS 'The longest string length identified in the column (for text-based types).';
COMMENT ON COLUMN bayanat.attribute_profile_results.avg_length IS 'The arithmetic mean of string lengths across all non-null records.';
COMMENT ON COLUMN bayanat.attribute_profile_results.min_value IS 'The lowest alphanumeric or numeric value found in the column, stored as text for cross-type compatibility.';
COMMENT ON COLUMN bayanat.attribute_profile_results.max_value IS 'The highest alphanumeric or numeric value found in the column.';
COMMENT ON COLUMN bayanat.attribute_profile_results.mean_value IS 'The average value for numeric columns; used to identify the data center.';
COMMENT ON COLUMN bayanat.attribute_profile_results.std_dev_value IS 'The standard deviation for numeric columns; used to detect data volatility and outliers.';
COMMENT ON COLUMN bayanat.attribute_profile_results.top_10_frequent_values IS 'JSON array of the 10 most common values and their respective frequencies (e.g., [{"val": "Active", "count": 500}]).';
COMMENT ON COLUMN bayanat.attribute_profile_results.pattern_distribution IS 'JSON map of regex pattern matches found during scanning to identify data formats like SSN, Emails, or IDs.';
COMMENT ON COLUMN bayanat.attribute_profile_results.quantile_data IS 'JSON object containing percentile distributions (P25, P50/Median, P75, P90) for numeric and date fields.';
COMMENT ON COLUMN bayanat.attribute_profile_results.profile_timestamp IS 'The exact date and time when the profiling query was completed.';


-- bayanat.audit_logs definition

-- Drop table

-- DROP TABLE bayanat.audit_logs;

CREATE TABLE bayanat.audit_logs (
	audit_id serial4 NOT NULL, -- Unique surrogate identifier for the audit event.
	action_type_code varchar(20) NOT NULL, -- The type of operation: CREATE, UPDATE, DELETE, LOGIN, or EXPORT.
	asset_type_code varchar(50) NOT NULL, -- The name of the table being modified (e.g., business_glossaries, data_entities).
	asset_id int4 NOT NULL, -- The primary key ID of the specific record being acted upon.
	user_id varchar(100) NOT NULL, -- The unique identifier of the user or system account that initiated the action.
	ip_address_text varchar(45) NULL, -- The network IP address of the client to provide a security trail.
	user_agent_text text NULL, -- Technical details of the browser or tool used (helps identify automated vs manual changes).
	action_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The precise date and time the action was recorded.
	CONSTRAINT audit_logs_pkey PRIMARY KEY (audit_id)
);
COMMENT ON TABLE bayanat.audit_logs IS 'The master security log recording every high-level action performed within the data catalog.';

-- Column comments

COMMENT ON COLUMN bayanat.audit_logs.audit_id IS 'Unique surrogate identifier for the audit event.';
COMMENT ON COLUMN bayanat.audit_logs.action_type_code IS 'The type of operation: CREATE, UPDATE, DELETE, LOGIN, or EXPORT.';
COMMENT ON COLUMN bayanat.audit_logs.asset_type_code IS 'The name of the table being modified (e.g., business_glossaries, data_entities).';
COMMENT ON COLUMN bayanat.audit_logs.asset_id IS 'The primary key ID of the specific record being acted upon.';
COMMENT ON COLUMN bayanat.audit_logs.user_id IS 'The unique identifier of the user or system account that initiated the action.';
COMMENT ON COLUMN bayanat.audit_logs.ip_address_text IS 'The network IP address of the client to provide a security trail.';
COMMENT ON COLUMN bayanat.audit_logs.user_agent_text IS 'Technical details of the browser or tool used (helps identify automated vs manual changes).';
COMMENT ON COLUMN bayanat.audit_logs.action_timestamp IS 'The precise date and time the action was recorded.';


-- bayanat.business_applications definition

-- Drop table

-- DROP TABLE bayanat.business_applications;

CREATE TABLE bayanat.business_applications (
	application_id serial4 NOT NULL, -- Unique surrogate identifier for the application.
	application_name_text varchar(100) NOT NULL, -- Common name of the software (e.g., Global ERP, Salesforce CRM).
	application_code varchar(20) NULL, -- Enterprise Architecture code used for cross-system tracking.
	owner_department_text varchar(100) NULL, -- The business unit responsible for the application (e.g., HR, Finance, Marketing).
	business_criticality_code varchar(20) NULL, -- Assessment of impact if the app is down (e.g., MISSION_CRITICAL, LOW_IMPACT).
	description_text text NULL, -- High-level business purpose of the application.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT business_applications_application_code_key UNIQUE (application_code),
	CONSTRAINT business_applications_pkey PRIMARY KEY (application_id)
);
COMMENT ON TABLE bayanat.business_applications IS 'Inventory of software applications that interact with data assets for business operations.';

-- Column comments

COMMENT ON COLUMN bayanat.business_applications.application_id IS 'Unique surrogate identifier for the application.';
COMMENT ON COLUMN bayanat.business_applications.application_name_text IS 'Common name of the software (e.g., Global ERP, Salesforce CRM).';
COMMENT ON COLUMN bayanat.business_applications.application_code IS 'Enterprise Architecture code used for cross-system tracking.';
COMMENT ON COLUMN bayanat.business_applications.owner_department_text IS 'The business unit responsible for the application (e.g., HR, Finance, Marketing).';
COMMENT ON COLUMN bayanat.business_applications.business_criticality_code IS 'Assessment of impact if the app is down (e.g., MISSION_CRITICAL, LOW_IMPACT).';
COMMENT ON COLUMN bayanat.business_applications.description_text IS 'High-level business purpose of the application.';


-- bayanat.certification_types definition

-- Drop table

-- DROP TABLE bayanat.certification_types;

CREATE TABLE bayanat.certification_types (
	cert_type_code varchar(20) NOT NULL, -- Unique code for the certification level.
	cert_type_name_text varchar(100) NOT NULL, -- Descriptive name of the certification (e.g., Enterprise Certified).
	description_text text NULL, -- Details on the requirements for achieving this certification.
	CONSTRAINT certification_types_pkey PRIMARY KEY (cert_type_code)
);
COMMENT ON TABLE bayanat.certification_types IS 'Defines standard trust levels or badges (e.g., GOLD, SILVER, PII_CERTIFIED).';

-- Column comments

COMMENT ON COLUMN bayanat.certification_types.cert_type_code IS 'Unique code for the certification level.';
COMMENT ON COLUMN bayanat.certification_types.cert_type_name_text IS 'Descriptive name of the certification (e.g., Enterprise Certified).';
COMMENT ON COLUMN bayanat.certification_types.description_text IS 'Details on the requirements for achieving this certification.';


-- bayanat.classification_types definition

-- Drop table

-- DROP TABLE bayanat.classification_types;

CREATE TABLE bayanat.classification_types (
	class_code varchar(20) NOT NULL, -- Unique code for the classification level (e.g., SECRET).
	class_name_text varchar(100) NOT NULL, -- Human-readable label for the sensitivity level.
	CONSTRAINT classification_types_pkey PRIMARY KEY (class_code)
);
COMMENT ON TABLE bayanat.classification_types IS 'Reference table for data sensitivity levels (Public to Top Secret).';

-- Column comments

COMMENT ON COLUMN bayanat.classification_types.class_code IS 'Unique code for the classification level (e.g., SECRET).';
COMMENT ON COLUMN bayanat.classification_types.class_name_text IS 'Human-readable label for the sensitivity level.';


-- bayanat.connection_registry definition

-- Drop table

-- DROP TABLE bayanat.connection_registry;

CREATE TABLE bayanat.connection_registry (
	connection_id serial4 NOT NULL, -- Unique surrogate primary key for the connection.
	connection_name varchar(100) NOT NULL, -- Friendly name for the source (e.g., Billing_Prod_Mirror).
	db_type_code varchar(20) NOT NULL, -- Type of DB engine: POSTGRES, MYSQL, MSSQL, ORACLE, SNOWFLAKE.
	host_address varchar(255) NOT NULL, -- IP address or DNS hostname of the database server.
	port_number int4 NOT NULL, -- Network port used for the database connection (e.g., 5432, 3306).
	database_name varchar(100) NULL, -- The specific database or catalog name within the instance.
	service_name varchar(100) NULL, -- The Oracle Service Name or SID (primarily used for Oracle connections).
	default_schema varchar(100) NULL, -- The primary schema to be scanned if none is specified during a task.
	credential_secret_path varchar(255) NULL, -- The path or alias to the password stored in a secure vault (never store raw passwords here).
	is_active_boolean bool DEFAULT true NULL, -- Flag to enable or disable automated scanning for this source.
	last_discovery_timestamp timestamp NULL, -- The last time the scanner successfully connected and harvested metadata.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT connection_registry_pkey PRIMARY KEY (connection_id)
);
COMMENT ON TABLE bayanat.connection_registry IS 'Central inventory of remote data sources and their technical connection parameters for metadata scanning.';

-- Column comments

COMMENT ON COLUMN bayanat.connection_registry.connection_id IS 'Unique surrogate primary key for the connection.';
COMMENT ON COLUMN bayanat.connection_registry.connection_name IS 'Friendly name for the source (e.g., Billing_Prod_Mirror).';
COMMENT ON COLUMN bayanat.connection_registry.db_type_code IS 'Type of DB engine: POSTGRES, MYSQL, MSSQL, ORACLE, SNOWFLAKE.';
COMMENT ON COLUMN bayanat.connection_registry.host_address IS 'IP address or DNS hostname of the database server.';
COMMENT ON COLUMN bayanat.connection_registry.port_number IS 'Network port used for the database connection (e.g., 5432, 3306).';
COMMENT ON COLUMN bayanat.connection_registry.database_name IS 'The specific database or catalog name within the instance.';
COMMENT ON COLUMN bayanat.connection_registry.service_name IS 'The Oracle Service Name or SID (primarily used for Oracle connections).';
COMMENT ON COLUMN bayanat.connection_registry.default_schema IS 'The primary schema to be scanned if none is specified during a task.';
COMMENT ON COLUMN bayanat.connection_registry.credential_secret_path IS 'The path or alias to the password stored in a secure vault (never store raw passwords here).';
COMMENT ON COLUMN bayanat.connection_registry.is_active_boolean IS 'Flag to enable or disable automated scanning for this source.';
COMMENT ON COLUMN bayanat.connection_registry.last_discovery_timestamp IS 'The last time the scanner successfully connected and harvested metadata.';


-- bayanat.data_sources definition

-- Drop table

-- DROP TABLE bayanat.data_sources;

CREATE TABLE bayanat.data_sources (
	data_source_id serial4 NOT NULL,
	source_name_text varchar(100) NOT NULL, -- The logical name assigned to the data source (e.g., Salesforce_Prod, AWS_Redshift_DW).
	source_type_code varchar(20) NOT NULL, -- The technology stack of the source (e.g., POSTGRES, SNOWFLAKE, S3, ORACLE).
	host_address_text varchar(255) NULL,
	database_name_text varchar(100) NOT NULL,
	description_text text NULL, -- A high-level business summary of the purpose and data contents of this specific instance.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT data_sources_pkey PRIMARY KEY (data_source_id)
);
COMMENT ON TABLE bayanat.data_sources IS 'Stores top-level connectivity and metadata for physical database instances or external data stores.';

-- Column comments

COMMENT ON COLUMN bayanat.data_sources.source_name_text IS 'The logical name assigned to the data source (e.g., Salesforce_Prod, AWS_Redshift_DW).';
COMMENT ON COLUMN bayanat.data_sources.source_type_code IS 'The technology stack of the source (e.g., POSTGRES, SNOWFLAKE, S3, ORACLE).';
COMMENT ON COLUMN bayanat.data_sources.description_text IS 'A high-level business summary of the purpose and data contents of this specific instance.';


-- bayanat.dq_dimensions definition

-- Drop table

-- DROP TABLE bayanat.dq_dimensions;

CREATE TABLE bayanat.dq_dimensions (
	dimension_code varchar(20) NOT NULL, -- Unique code for the quality dimension (e.g., COMP).
	dimension_name_text varchar(100) NOT NULL, -- Human-readable name of the dimension (e.g., Completeness).
	description_text text NULL, -- Formal definition of what this quality dimension measures.
	CONSTRAINT dq_dimensions_pkey PRIMARY KEY (dimension_code)
);
COMMENT ON TABLE bayanat.dq_dimensions IS 'Standardized categories used to classify types of data quality checks (e.g., Accuracy, Completeness).';

-- Column comments

COMMENT ON COLUMN bayanat.dq_dimensions.dimension_code IS 'Unique code for the quality dimension (e.g., COMP).';
COMMENT ON COLUMN bayanat.dq_dimensions.dimension_name_text IS 'Human-readable name of the dimension (e.g., Completeness).';
COMMENT ON COLUMN bayanat.dq_dimensions.description_text IS 'Formal definition of what this quality dimension measures.';


-- bayanat.entity_groups definition

-- Drop table

-- DROP TABLE bayanat.entity_groups;

CREATE TABLE bayanat.entity_groups (
	group_id serial4 NOT NULL,
	group_name_text varchar(100) NOT NULL, -- Logical label for the subset (e.g., Marketing_Contact_Tables).
	description_text text NULL, -- Explanation of why these specific tables are grouped together.
	CONSTRAINT entity_groups_pkey PRIMARY KEY (group_id)
);
COMMENT ON TABLE bayanat.entity_groups IS 'Custom collections of tables used when an application maps to a subset of a schema.';

-- Column comments

COMMENT ON COLUMN bayanat.entity_groups.group_name_text IS 'Logical label for the subset (e.g., Marketing_Contact_Tables).';
COMMENT ON COLUMN bayanat.entity_groups.description_text IS 'Explanation of why these specific tables are grouped together.';


-- bayanat.lineage_transformation_types definition

-- Drop table

-- DROP TABLE bayanat.lineage_transformation_types;

CREATE TABLE bayanat.lineage_transformation_types (
	transformation_type_code varchar(20) NOT NULL, -- Unique code identifier for the transformation type.
	transformation_type_name_text varchar(100) NOT NULL, -- Human-readable name for the transformation process.
	description_text text NULL, -- Detailed technical description of the transformation method.
	CONSTRAINT lineage_transformation_types_pkey PRIMARY KEY (transformation_type_code)
);
COMMENT ON TABLE bayanat.lineage_transformation_types IS 'Reference table for the logic applied during data movement (e.g., JOIN, AGGREGATION).';

-- Column comments

COMMENT ON COLUMN bayanat.lineage_transformation_types.transformation_type_code IS 'Unique code identifier for the transformation type.';
COMMENT ON COLUMN bayanat.lineage_transformation_types.transformation_type_name_text IS 'Human-readable name for the transformation process.';
COMMENT ON COLUMN bayanat.lineage_transformation_types.description_text IS 'Detailed technical description of the transformation method.';


-- bayanat.npi_category_types definition

-- Drop table

-- DROP TABLE bayanat.npi_category_types;

CREATE TABLE bayanat.npi_category_types (
	category_code varchar(20) NOT NULL, -- Internal code (e.g., TECH, INVENTORY).
	category_name_text varchar(100) NOT NULL, -- The official name of the NPI category.
	CONSTRAINT npi_category_types_pkey PRIMARY KEY (category_code)
);
COMMENT ON TABLE bayanat.npi_category_types IS 'Defines Non-Personal Information (NPI) categories for internal data classification.';

-- Column comments

COMMENT ON COLUMN bayanat.npi_category_types.category_code IS 'Internal code (e.g., TECH, INVENTORY).';
COMMENT ON COLUMN bayanat.npi_category_types.category_name_text IS 'The official name of the NPI category.';


-- bayanat.pi_category_types definition

-- Drop table

-- DROP TABLE bayanat.pi_category_types;

CREATE TABLE bayanat.pi_category_types (
	category_code varchar(20) NOT NULL, -- Internal code (e.g., BIO, HEALTH).
	category_name_text varchar(100) NOT NULL, -- The official name of the PI category (e.g., Biometric Information).
	CONSTRAINT pi_category_types_pkey PRIMARY KEY (category_code)
);
COMMENT ON TABLE bayanat.pi_category_types IS 'Defines specific categories of Personal Information (PI) for regulatory compliance.';

-- Column comments

COMMENT ON COLUMN bayanat.pi_category_types.category_code IS 'Internal code (e.g., BIO, HEALTH).';
COMMENT ON COLUMN bayanat.pi_category_types.category_name_text IS 'The official name of the PI category (e.g., Biometric Information).';


-- bayanat.stakeholder_roles definition

-- Drop table

-- DROP TABLE bayanat.stakeholder_roles;

CREATE TABLE bayanat.stakeholder_roles (
	role_code varchar(20) NOT NULL, -- Unique alphanumeric code for the role (e.g., DQ_OFFICER).
	role_name_text varchar(100) NOT NULL, -- Human-readable name of the governance role.
	description_text text NULL, -- Business definition of the responsibilities and authorities for this role.
	CONSTRAINT stakeholder_roles_pkey PRIMARY KEY (role_code)
);
COMMENT ON TABLE bayanat.stakeholder_roles IS 'Defines official governance roles (e.g., OWNER, BIZ_STEWARD) used to assign accountability to assets.';

-- Column comments

COMMENT ON COLUMN bayanat.stakeholder_roles.role_code IS 'Unique alphanumeric code for the role (e.g., DQ_OFFICER).';
COMMENT ON COLUMN bayanat.stakeholder_roles.role_name_text IS 'Human-readable name of the governance role.';
COMMENT ON COLUMN bayanat.stakeholder_roles.description_text IS 'Business definition of the responsibilities and authorities for this role.';


-- bayanat.workflow_definitions definition

-- Drop table

-- DROP TABLE bayanat.workflow_definitions;

CREATE TABLE bayanat.workflow_definitions (
	workflow_id serial4 NOT NULL, -- Unique surrogate identifier for the workflow template.
	workflow_name_text varchar(100) NOT NULL, -- The formal name of the workflow process.
	description_text text NULL, -- The business purpose and scope of this workflow.
	CONSTRAINT workflow_definitions_pkey PRIMARY KEY (workflow_id)
);
COMMENT ON TABLE bayanat.workflow_definitions IS 'High-level templates for governance processes such as Access Requests or DQ Remediation.';

-- Column comments

COMMENT ON COLUMN bayanat.workflow_definitions.workflow_id IS 'Unique surrogate identifier for the workflow template.';
COMMENT ON COLUMN bayanat.workflow_definitions.workflow_name_text IS 'The formal name of the workflow process.';
COMMENT ON COLUMN bayanat.workflow_definitions.description_text IS 'The business purpose and scope of this workflow.';


-- bayanat.asset_answers definition

-- Drop table

-- DROP TABLE bayanat.asset_answers;

CREATE TABLE bayanat.asset_answers (
	answer_id serial4 NOT NULL, -- Unique surrogate identifier for the answer.
	question_id int4 NOT NULL, -- The parent question this answer addresses.
	responder_user_id varchar(100) NOT NULL, -- The Subject Matter Expert (SME) or Steward who provided the answer.
	answer_text text NOT NULL, -- The content of the response.
	is_accepted_indicator bool DEFAULT false NULL, -- Flag indicating if this answer was verified as correct by the requester or a steward.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT asset_answers_pkey PRIMARY KEY (answer_id),
	CONSTRAINT asset_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES bayanat.asset_questions(question_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.asset_answers IS 'Stores responses to user questions, facilitating a knowledge base for the catalog.';

-- Column comments

COMMENT ON COLUMN bayanat.asset_answers.answer_id IS 'Unique surrogate identifier for the answer.';
COMMENT ON COLUMN bayanat.asset_answers.question_id IS 'The parent question this answer addresses.';
COMMENT ON COLUMN bayanat.asset_answers.responder_user_id IS 'The Subject Matter Expert (SME) or Steward who provided the answer.';
COMMENT ON COLUMN bayanat.asset_answers.answer_text IS 'The content of the response.';
COMMENT ON COLUMN bayanat.asset_answers.is_accepted_indicator IS 'Flag indicating if this answer was verified as correct by the requester or a steward.';


-- bayanat.asset_certifications definition

-- Drop table

-- DROP TABLE bayanat.asset_certifications;

CREATE TABLE bayanat.asset_certifications (
	certification_id serial4 NOT NULL,
	asset_type_code varchar(50) NOT NULL, -- The type of asset receiving the certification.
	asset_id int4 NOT NULL, -- The primary key of the certified asset.
	cert_type_code varchar(20) NOT NULL, -- Reference to the type of certification granted.
	certified_by_user_id varchar(100) NOT NULL, -- The Data Steward or Authority who verified the asset.
	certification_date date DEFAULT CURRENT_DATE NULL, -- The date the certification was officially granted.
	expiry_date date NULL, -- Optional date when the certification must be reviewed or renewed.
	certification_notes_text text NULL, -- Governance commentary regarding the certification audit.
	CONSTRAINT asset_certifications_pkey PRIMARY KEY (certification_id),
	CONSTRAINT asset_certifications_cert_type_code_fkey FOREIGN KEY (cert_type_code) REFERENCES bayanat.certification_types(cert_type_code)
);
COMMENT ON TABLE bayanat.asset_certifications IS 'Records official data stewardship approval for catalog assets.';

-- Column comments

COMMENT ON COLUMN bayanat.asset_certifications.asset_type_code IS 'The type of asset receiving the certification.';
COMMENT ON COLUMN bayanat.asset_certifications.asset_id IS 'The primary key of the certified asset.';
COMMENT ON COLUMN bayanat.asset_certifications.cert_type_code IS 'Reference to the type of certification granted.';
COMMENT ON COLUMN bayanat.asset_certifications.certified_by_user_id IS 'The Data Steward or Authority who verified the asset.';
COMMENT ON COLUMN bayanat.asset_certifications.certification_date IS 'The date the certification was officially granted.';
COMMENT ON COLUMN bayanat.asset_certifications.expiry_date IS 'Optional date when the certification must be reviewed or renewed.';
COMMENT ON COLUMN bayanat.asset_certifications.certification_notes_text IS 'Governance commentary regarding the certification audit.';


-- bayanat.asset_stakeholders definition

-- Drop table

-- DROP TABLE bayanat.asset_stakeholders;

CREATE TABLE bayanat.asset_stakeholders (
	assignment_id serial4 NOT NULL, -- Unique surrogate identifier for the assignment.
	asset_type_code varchar(50) NOT NULL, -- The type of asset being governed (e.g., DATA_ENTITIES, DATA_ATTRIBUTES).
	asset_id int4 NOT NULL, -- The primary key ID of the target asset from its respective table.
	user_id varchar(100) NOT NULL, -- The identifier of the user or system account assigned to the role.
	role_code varchar(20) NULL, -- The role the user performs for this specific asset.
	assigned_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The timestamp when this stakeholder assignment was created.
	CONSTRAINT asset_stakeholders_pkey PRIMARY KEY (assignment_id),
	CONSTRAINT uq_asset_role_user UNIQUE (asset_type_code, asset_id, user_id, role_code),
	CONSTRAINT asset_stakeholders_role_code_fkey FOREIGN KEY (role_code) REFERENCES bayanat.stakeholder_roles(role_code)
);
COMMENT ON TABLE bayanat.asset_stakeholders IS 'Maps specific users to catalog assets in designated governance roles.';

-- Column comments

COMMENT ON COLUMN bayanat.asset_stakeholders.assignment_id IS 'Unique surrogate identifier for the assignment.';
COMMENT ON COLUMN bayanat.asset_stakeholders.asset_type_code IS 'The type of asset being governed (e.g., DATA_ENTITIES, DATA_ATTRIBUTES).';
COMMENT ON COLUMN bayanat.asset_stakeholders.asset_id IS 'The primary key ID of the target asset from its respective table.';
COMMENT ON COLUMN bayanat.asset_stakeholders.user_id IS 'The identifier of the user or system account assigned to the role.';
COMMENT ON COLUMN bayanat.asset_stakeholders.role_code IS 'The role the user performs for this specific asset.';
COMMENT ON COLUMN bayanat.asset_stakeholders.assigned_at_timestamp IS 'The timestamp when this stakeholder assignment was created.';


-- bayanat.business_glossaries definition

-- Drop table

-- DROP TABLE bayanat.business_glossaries;

CREATE TABLE bayanat.business_glossaries (
	glossary_id int4 DEFAULT nextval('bayanat.business_glossary_glossary_id_seq'::regclass) NOT NULL, -- Unique surrogate key for the glossary entry.
	parent_glossary_id int4 NULL, -- Self-referencing key used to build hierarchy (Domain > Subdomain > Term).
	term_name_text varchar(255) NOT NULL, -- The authoritative name of the business term or domain.
	definition_text text NOT NULL, -- Clear business description of the term.
	business_rules_text text NULL, -- Logical constraints or calculation logic (e.g., "Age must be calculated from DOB").
	format_text varchar(100) NULL, -- The expected data representation (e.g., Email format, Currency mask).
	example_text text NULL, -- An illustrative example of the data value.
	classification_code varchar(20) NULL, -- Links to the sensitivity level of the data.
	is_pii_indicator bool DEFAULT false NULL, -- Boolean flag: TRUE if the term represents Personally Identifiable Information.
	pi_category_code varchar(20) NULL, -- The specific regulatory category of personal data (if PII).
	npi_category_code varchar(20) NULL, -- The specific category for non-personal data.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT business_glossary_pkey PRIMARY KEY (glossary_id),
	CONSTRAINT business_glossary_classification_code_fkey FOREIGN KEY (classification_code) REFERENCES bayanat.classification_types(class_code),
	CONSTRAINT business_glossary_npi_category_code_fkey FOREIGN KEY (npi_category_code) REFERENCES bayanat.npi_category_types(category_code),
	CONSTRAINT business_glossary_parent_glossary_id_fkey FOREIGN KEY (parent_glossary_id) REFERENCES bayanat.business_glossaries(glossary_id),
	CONSTRAINT business_glossary_pi_category_code_fkey FOREIGN KEY (pi_category_code) REFERENCES bayanat.pi_category_types(category_code)
);
COMMENT ON TABLE bayanat.business_glossaries IS 'Hierarchical registry of domains, subdomains, and business terms with integrated privacy governance.';

-- Column comments

COMMENT ON COLUMN bayanat.business_glossaries.glossary_id IS 'Unique surrogate key for the glossary entry.';
COMMENT ON COLUMN bayanat.business_glossaries.parent_glossary_id IS 'Self-referencing key used to build hierarchy (Domain > Subdomain > Term).';
COMMENT ON COLUMN bayanat.business_glossaries.term_name_text IS 'The authoritative name of the business term or domain.';
COMMENT ON COLUMN bayanat.business_glossaries.definition_text IS 'Clear business description of the term.';
COMMENT ON COLUMN bayanat.business_glossaries.business_rules_text IS 'Logical constraints or calculation logic (e.g., "Age must be calculated from DOB").';
COMMENT ON COLUMN bayanat.business_glossaries.format_text IS 'The expected data representation (e.g., Email format, Currency mask).';
COMMENT ON COLUMN bayanat.business_glossaries.example_text IS 'An illustrative example of the data value.';
COMMENT ON COLUMN bayanat.business_glossaries.classification_code IS 'Links to the sensitivity level of the data.';
COMMENT ON COLUMN bayanat.business_glossaries.is_pii_indicator IS 'Boolean flag: TRUE if the term represents Personally Identifiable Information.';
COMMENT ON COLUMN bayanat.business_glossaries.pi_category_code IS 'The specific regulatory category of personal data (if PII).';
COMMENT ON COLUMN bayanat.business_glossaries.npi_category_code IS 'The specific category for non-personal data.';

-- Table Triggers

create trigger trg_audit_business_glossaries after
delete
    or
update
    on
    bayanat.business_glossaries for each row execute function bayanat.fn_audit_metadata_changes();

COMMENT ON TRIGGER trg_audit_business_glossaries ON bayanat.business_glossaries IS 'Tracks all modifications to the business glossary terms.';


-- bayanat.data_lineage definition

-- Drop table

-- DROP TABLE bayanat.data_lineage;

CREATE TABLE bayanat.data_lineage (
	lineage_id serial4 NOT NULL, -- Unique surrogate key for the lineage record.
	lineage_scope_code varchar(20) NOT NULL, -- Defines the level of detail: e.g., SYSTEM_LEVEL, ENTITY_LEVEL, or ATTRIBUTE_LEVEL.
	source_asset_id int4 NOT NULL, -- The ID of the upstream origin asset (e.g., source column ID).
	target_asset_id int4 NOT NULL, -- The ID of the downstream destination asset (e.g., target column ID).
	transformation_type_code varchar(20) NULL, -- Reference to the logic applied during the movement.
	transformation_logic_text text NULL, -- Stores the SQL snippet or business logic used to transform the source data into the target.
	last_updated_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- Timestamp of when this lineage link was last verified or updated.
	updated_by_user_id varchar(100) NULL, -- The user or system process that registered this lineage link.
	asset_type_code varchar(20) NULL,
	process_id int4 NULL,
	CONSTRAINT data_lineage_pkey PRIMARY KEY (lineage_id),
	CONSTRAINT data_lineage_transformation_type_code_fkey FOREIGN KEY (transformation_type_code) REFERENCES bayanat.lineage_transformation_types(transformation_type_code)
);
COMMENT ON TABLE bayanat.data_lineage IS 'The central repository for all data movement relationships, supporting both automated system discovery and manual stewardship.';

-- Column comments

COMMENT ON COLUMN bayanat.data_lineage.lineage_id IS 'Unique surrogate key for the lineage record.';
COMMENT ON COLUMN bayanat.data_lineage.lineage_scope_code IS 'Defines the level of detail: e.g., SYSTEM_LEVEL, ENTITY_LEVEL, or ATTRIBUTE_LEVEL.';
COMMENT ON COLUMN bayanat.data_lineage.source_asset_id IS 'The ID of the upstream origin asset (e.g., source column ID).';
COMMENT ON COLUMN bayanat.data_lineage.target_asset_id IS 'The ID of the downstream destination asset (e.g., target column ID).';
COMMENT ON COLUMN bayanat.data_lineage.transformation_type_code IS 'Reference to the logic applied during the movement.';
COMMENT ON COLUMN bayanat.data_lineage.transformation_logic_text IS 'Stores the SQL snippet or business logic used to transform the source data into the target.';
COMMENT ON COLUMN bayanat.data_lineage.last_updated_timestamp IS 'Timestamp of when this lineage link was last verified or updated.';
COMMENT ON COLUMN bayanat.data_lineage.updated_by_user_id IS 'The user or system process that registered this lineage link.';


-- bayanat.data_schemas definition

-- Drop table

-- DROP TABLE bayanat.data_schemas;

CREATE TABLE bayanat.data_schemas (
	schema_id serial4 NOT NULL,
	data_source_id int4 NULL,
	schema_name_text varchar(100) NOT NULL, -- The physical name of the schema as it appears in the database system catalog.
	description_text text NULL, -- Documentation regarding the functional domain of this schema (e.g., HR_Analytics, Finance_Staging).
	owner_user_id varchar(100) NULL,
	CONSTRAINT data_schemas_pkey PRIMARY KEY (schema_id),
	CONSTRAINT data_schemas_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES bayanat.data_sources(data_source_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.data_schemas IS 'Represents the namespace or logical grouping of tables within a specific Data Source.';

-- Column comments

COMMENT ON COLUMN bayanat.data_schemas.schema_name_text IS 'The physical name of the schema as it appears in the database system catalog.';
COMMENT ON COLUMN bayanat.data_schemas.description_text IS 'Documentation regarding the functional domain of this schema (e.g., HR_Analytics, Finance_Staging).';


-- bayanat.dq_rules definition

-- Drop table

-- DROP TABLE bayanat.dq_rules;

CREATE TABLE bayanat.dq_rules (
	rule_id serial4 NOT NULL, -- Unique surrogate identifier for the data quality rule.
	rule_name_text varchar(150) NOT NULL, -- Descriptive name for the rule (e.g., "NULL Check on Customer ID").
	dimension_code varchar(20) NULL, -- Reference to the data quality dimension this rule supports.
	asset_type_code varchar(50) NOT NULL, -- The type of asset the rule targets (e.g., DATA_ATTRIBUTES, DATA_ENTITIES).
	asset_id int4 NOT NULL, -- The primary key of the specific asset being validated.
	rule_logic_type_code varchar(20) NULL, -- Technique used for validation (e.g., SQL_QUERY, REGEX, THRESHOLD).
	rule_definition_text text NOT NULL, -- The technical expression or code used to execute the validation.
	severity_level_code varchar(20) NULL, -- The criticality of the rule failure (e.g., BLOCKER, WARNING, INFO).
	is_active_indicator bool DEFAULT true NULL, -- Boolean flag: TRUE if the rule is currently being enforced.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- Audit timestamp of when the rule was defined.
	CONSTRAINT dq_rules_pkey PRIMARY KEY (rule_id),
	CONSTRAINT dq_rules_dimension_code_fkey FOREIGN KEY (dimension_code) REFERENCES bayanat.dq_dimensions(dimension_code)
);
COMMENT ON TABLE bayanat.dq_rules IS 'Stores the specific validation criteria and logic applied to assets within the catalog.';

-- Column comments

COMMENT ON COLUMN bayanat.dq_rules.rule_id IS 'Unique surrogate identifier for the data quality rule.';
COMMENT ON COLUMN bayanat.dq_rules.rule_name_text IS 'Descriptive name for the rule (e.g., "NULL Check on Customer ID").';
COMMENT ON COLUMN bayanat.dq_rules.dimension_code IS 'Reference to the data quality dimension this rule supports.';
COMMENT ON COLUMN bayanat.dq_rules.asset_type_code IS 'The type of asset the rule targets (e.g., DATA_ATTRIBUTES, DATA_ENTITIES).';
COMMENT ON COLUMN bayanat.dq_rules.asset_id IS 'The primary key of the specific asset being validated.';
COMMENT ON COLUMN bayanat.dq_rules.rule_logic_type_code IS 'Technique used for validation (e.g., SQL_QUERY, REGEX, THRESHOLD).';
COMMENT ON COLUMN bayanat.dq_rules.rule_definition_text IS 'The technical expression or code used to execute the validation.';
COMMENT ON COLUMN bayanat.dq_rules.severity_level_code IS 'The criticality of the rule failure (e.g., BLOCKER, WARNING, INFO).';
COMMENT ON COLUMN bayanat.dq_rules.is_active_indicator IS 'Boolean flag: TRUE if the rule is currently being enforced.';
COMMENT ON COLUMN bayanat.dq_rules.created_at_timestamp IS 'Audit timestamp of when the rule was defined.';


-- bayanat.glossary_aliases definition

-- Drop table

-- DROP TABLE bayanat.glossary_aliases;

CREATE TABLE bayanat.glossary_aliases (
	alias_id serial4 NOT NULL,
	glossary_id int4 NULL, -- Reference to the primary business term.
	alias_name_text varchar(255) NOT NULL, -- The alternative label or synonym.
	CONSTRAINT glossary_aliases_pkey PRIMARY KEY (alias_id),
	CONSTRAINT glossary_aliases_glossary_id_fkey FOREIGN KEY (glossary_id) REFERENCES bayanat.business_glossaries(glossary_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.glossary_aliases IS 'Synonyms or alternative names used across different departments for the same business term.';

-- Column comments

COMMENT ON COLUMN bayanat.glossary_aliases.glossary_id IS 'Reference to the primary business term.';
COMMENT ON COLUMN bayanat.glossary_aliases.alias_name_text IS 'The alternative label or synonym.';


-- bayanat.history_logs definition

-- Drop table

-- DROP TABLE bayanat.history_logs;

CREATE TABLE bayanat.history_logs (
	history_id serial4 NOT NULL, -- Unique surrogate identifier for the history snapshot.
	audit_id int4 NULL, -- Foreign key linking the change back to the primary audit event (Who/When).
	field_name_text varchar(100) NOT NULL, -- The specific column name within the asset that was changed (e.g., friendly_name_text).
	old_value_text text NULL, -- The data value as it existed before the modification.
	new_value_text text NULL, -- The new data value after the modification was committed.
	CONSTRAINT history_logs_pkey PRIMARY KEY (history_id),
	CONSTRAINT history_logs_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES bayanat.audit_logs(audit_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.history_logs IS 'Detailed history of state changes, capturing specific field-level modifications linked to an audit event.';

-- Column comments

COMMENT ON COLUMN bayanat.history_logs.history_id IS 'Unique surrogate identifier for the history snapshot.';
COMMENT ON COLUMN bayanat.history_logs.audit_id IS 'Foreign key linking the change back to the primary audit event (Who/When).';
COMMENT ON COLUMN bayanat.history_logs.field_name_text IS 'The specific column name within the asset that was changed (e.g., friendly_name_text).';
COMMENT ON COLUMN bayanat.history_logs.old_value_text IS 'The data value as it existed before the modification.';
COMMENT ON COLUMN bayanat.history_logs.new_value_text IS 'The new data value after the modification was committed.';


-- bayanat.tags definition

-- Drop table

-- DROP TABLE bayanat.tags;

CREATE TABLE bayanat.tags (
	tag_id serial4 NOT NULL, -- Unique surrogate identifier for the tag.
	parent_tag_id int4 NULL, -- Self-reference to create a hierarchy (e.g., Parent: "Compliance", Child: "GDPR").
	tag_name_text varchar(100) NOT NULL, -- The specific label or keyword for the tag.
	description_text text NULL, -- Business definition and usage guidelines for when to apply this tag.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- Audit timestamp of when the tag was first defined in the system.
	CONSTRAINT tags_pkey PRIMARY KEY (tag_id),
	CONSTRAINT tags_parent_tag_id_fkey FOREIGN KEY (parent_tag_id) REFERENCES bayanat.tags(tag_id)
);
COMMENT ON TABLE bayanat.tags IS 'The central repository for hierarchical metadata tags used across all catalog assets.';

-- Column comments

COMMENT ON COLUMN bayanat.tags.tag_id IS 'Unique surrogate identifier for the tag.';
COMMENT ON COLUMN bayanat.tags.parent_tag_id IS 'Self-reference to create a hierarchy (e.g., Parent: "Compliance", Child: "GDPR").';
COMMENT ON COLUMN bayanat.tags.tag_name_text IS 'The specific label or keyword for the tag.';
COMMENT ON COLUMN bayanat.tags.description_text IS 'Business definition and usage guidelines for when to apply this tag.';
COMMENT ON COLUMN bayanat.tags.created_at_timestamp IS 'Audit timestamp of when the tag was first defined in the system.';


-- bayanat.workflow_stages definition

-- Drop table

-- DROP TABLE bayanat.workflow_stages;

CREATE TABLE bayanat.workflow_stages (
	stage_id serial4 NOT NULL, -- Unique identifier for the stage.
	workflow_id int4 NULL, -- Reference to the parent workflow definition.
	stage_name_text varchar(50) NOT NULL, -- The name of the state (e.g., PENDING_OWNER_APPROVAL).
	required_role_code varchar(20) NULL, -- The role authorized to take action in this stage.
	sla_days_count int4 DEFAULT 3 NULL, -- The number of days allowed to complete this stage before it is considered overdue.
	CONSTRAINT workflow_stages_pkey PRIMARY KEY (stage_id),
	CONSTRAINT workflow_stages_required_role_code_fkey FOREIGN KEY (required_role_code) REFERENCES bayanat.stakeholder_roles(role_code),
	CONSTRAINT workflow_stages_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES bayanat.workflow_definitions(workflow_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.workflow_stages IS 'Defines the distinct states within a workflow and the requirements to clear them.';

-- Column comments

COMMENT ON COLUMN bayanat.workflow_stages.stage_id IS 'Unique identifier for the stage.';
COMMENT ON COLUMN bayanat.workflow_stages.workflow_id IS 'Reference to the parent workflow definition.';
COMMENT ON COLUMN bayanat.workflow_stages.stage_name_text IS 'The name of the state (e.g., PENDING_OWNER_APPROVAL).';
COMMENT ON COLUMN bayanat.workflow_stages.required_role_code IS 'The role authorized to take action in this stage.';
COMMENT ON COLUMN bayanat.workflow_stages.sla_days_count IS 'The number of days allowed to complete this stage before it is considered overdue.';


-- bayanat.workflow_transitions definition

-- Drop table

-- DROP TABLE bayanat.workflow_transitions;

CREATE TABLE bayanat.workflow_transitions (
	transition_id serial4 NOT NULL, -- Unique identifier for the transition rule.
	workflow_id int4 NULL, -- The workflow template this transition belongs to.
	from_stage_id int4 NULL, -- The current stage of the task.
	to_stage_id int4 NULL, -- The destination stage if the action is triggered.
	action_result_code varchar(20) NOT NULL, -- The outcome (e.g., APPROVE, REJECT) that triggers this move.
	transition_name_text varchar(100) NULL, -- Descriptive name of the transition path.
	CONSTRAINT workflow_transitions_pkey PRIMARY KEY (transition_id),
	CONSTRAINT workflow_transitions_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES bayanat.workflow_stages(stage_id),
	CONSTRAINT workflow_transitions_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES bayanat.workflow_stages(stage_id),
	CONSTRAINT workflow_transitions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES bayanat.workflow_definitions(workflow_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.workflow_transitions IS 'The branching logic determining the next stage based on an action (APPROVE/REJECT).';

-- Column comments

COMMENT ON COLUMN bayanat.workflow_transitions.transition_id IS 'Unique identifier for the transition rule.';
COMMENT ON COLUMN bayanat.workflow_transitions.workflow_id IS 'The workflow template this transition belongs to.';
COMMENT ON COLUMN bayanat.workflow_transitions.from_stage_id IS 'The current stage of the task.';
COMMENT ON COLUMN bayanat.workflow_transitions.to_stage_id IS 'The destination stage if the action is triggered.';
COMMENT ON COLUMN bayanat.workflow_transitions.action_result_code IS 'The outcome (e.g., APPROVE, REJECT) that triggers this move.';
COMMENT ON COLUMN bayanat.workflow_transitions.transition_name_text IS 'Descriptive name of the transition path.';


-- bayanat.application_data_mappings definition

-- Drop table

-- DROP TABLE bayanat.application_data_mappings;

CREATE TABLE bayanat.application_data_mappings (
	mapping_id serial4 NOT NULL,
	application_id int4 NULL,
	mapped_entity_type varchar(20) NOT NULL, -- Defines the granularity of the link: DATA_SOURCE, SCHEMA, or TABLE_GROUP.
	data_source_id int4 NULL,
	schema_id int4 NULL,
	usage_type_code varchar(20) NULL, -- Nature of the interaction: READ_ONLY, WRITE, or OWNER.
	description_text text NULL, -- Context for why this application uses this specific data asset.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT application_data_mappings_pkey PRIMARY KEY (mapping_id),
	CONSTRAINT uq_app_mapping UNIQUE (application_id, mapped_entity_type, data_source_id, schema_id),
	CONSTRAINT application_data_mappings_application_id_fkey FOREIGN KEY (application_id) REFERENCES bayanat.business_applications(application_id) ON DELETE CASCADE,
	CONSTRAINT application_data_mappings_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES bayanat.data_sources(data_source_id),
	CONSTRAINT application_data_mappings_schema_id_fkey FOREIGN KEY (schema_id) REFERENCES bayanat.data_schemas(schema_id)
);
COMMENT ON TABLE bayanat.application_data_mappings IS 'Defines relationships between applications and data levels (Source, Schema, or Group).';

-- Column comments

COMMENT ON COLUMN bayanat.application_data_mappings.mapped_entity_type IS 'Defines the granularity of the link: DATA_SOURCE, SCHEMA, or TABLE_GROUP.';
COMMENT ON COLUMN bayanat.application_data_mappings.usage_type_code IS 'Nature of the interaction: READ_ONLY, WRITE, or OWNER.';
COMMENT ON COLUMN bayanat.application_data_mappings.description_text IS 'Context for why this application uses this specific data asset.';


-- bayanat.data_entities definition

-- Drop table

-- DROP TABLE bayanat.data_entities;

CREATE TABLE bayanat.data_entities (
	entity_id serial4 NOT NULL,
	schema_id int4 NULL,
	entity_name_text varchar(100) NOT NULL, -- The physical name of the table in the database (e.g., dim_customer).
	display_name_text varchar(255) NULL, -- The business-friendly name for the table (e.g., Customer Master Table).
	entity_category_code varchar(20) NULL, -- Classification code: MASTER, TRANSACTIONAL, REFERENCE, or SYSTEM.
	description_text text NULL, -- Detailed explanation of the table grain, update frequency, and business value.
	is_view_indicator bool DEFAULT false NULL, -- Boolean flag: TRUE if the entity is a virtual view, FALSE if it is a physical table.
	CONSTRAINT data_entities_pkey PRIMARY KEY (entity_id),
	CONSTRAINT data_entities_schema_id_fkey FOREIGN KEY (schema_id) REFERENCES bayanat.data_schemas(schema_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.data_entities IS 'The core catalog table representing physical tables or views within a schema.';

-- Column comments

COMMENT ON COLUMN bayanat.data_entities.entity_name_text IS 'The physical name of the table in the database (e.g., dim_customer).';
COMMENT ON COLUMN bayanat.data_entities.display_name_text IS 'The business-friendly name for the table (e.g., Customer Master Table).';
COMMENT ON COLUMN bayanat.data_entities.entity_category_code IS 'Classification code: MASTER, TRANSACTIONAL, REFERENCE, or SYSTEM.';
COMMENT ON COLUMN bayanat.data_entities.description_text IS 'Detailed explanation of the table grain, update frequency, and business value.';
COMMENT ON COLUMN bayanat.data_entities.is_view_indicator IS 'Boolean flag: TRUE if the entity is a virtual view, FALSE if it is a physical table.';


-- bayanat.dq_results definition

-- Drop table

-- DROP TABLE bayanat.dq_results;

CREATE TABLE bayanat.dq_results (
	result_id serial4 NOT NULL, -- Unique surrogate identifier for the execution record.
	rule_id int4 NULL, -- The parent rule that was executed.
	execution_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The exact time the quality check was performed.
	records_scanned_count int4 NULL, -- Total volume of data processed during the check.
	records_failed_count int4 NULL, -- Count of records that did not meet the rule criteria.
	failure_percentage_number numeric(5, 2) NULL, -- Percentage of failed records (failed/scanned).
	status_code varchar(20) NULL, -- The outcome of the check (e.g., PASSED, FAILED, ERROR).
	result_message_text text NULL, -- Detailed logs or error messages from the execution engine.
	CONSTRAINT dq_results_pkey PRIMARY KEY (result_id),
	CONSTRAINT dq_results_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES bayanat.dq_rules(rule_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.dq_results IS 'Historical log of execution outcomes for data quality rules.';

-- Column comments

COMMENT ON COLUMN bayanat.dq_results.result_id IS 'Unique surrogate identifier for the execution record.';
COMMENT ON COLUMN bayanat.dq_results.rule_id IS 'The parent rule that was executed.';
COMMENT ON COLUMN bayanat.dq_results.execution_timestamp IS 'The exact time the quality check was performed.';
COMMENT ON COLUMN bayanat.dq_results.records_scanned_count IS 'Total volume of data processed during the check.';
COMMENT ON COLUMN bayanat.dq_results.records_failed_count IS 'Count of records that did not meet the rule criteria.';
COMMENT ON COLUMN bayanat.dq_results.failure_percentage_number IS 'Percentage of failed records (failed/scanned).';
COMMENT ON COLUMN bayanat.dq_results.status_code IS 'The outcome of the check (e.g., PASSED, FAILED, ERROR).';
COMMENT ON COLUMN bayanat.dq_results.result_message_text IS 'Detailed logs or error messages from the execution engine.';


-- bayanat.entity_group_members definition

-- Drop table

-- DROP TABLE bayanat.entity_group_members;

CREATE TABLE bayanat.entity_group_members (
	group_id int4 NOT NULL, -- Reference to the parent logical group.
	entity_id int4 NOT NULL, -- Reference to the physical table included in the group.
	CONSTRAINT entity_group_members_pkey PRIMARY KEY (group_id, entity_id),
	CONSTRAINT entity_group_members_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
	CONSTRAINT entity_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES bayanat.entity_groups(group_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.entity_group_members IS 'Intersection table linking specific tables to a logical group.';

-- Column comments

COMMENT ON COLUMN bayanat.entity_group_members.group_id IS 'Reference to the parent logical group.';
COMMENT ON COLUMN bayanat.entity_group_members.entity_id IS 'Reference to the physical table included in the group.';


-- bayanat.governance_tasks definition

-- Drop table

-- DROP TABLE bayanat.governance_tasks;

CREATE TABLE bayanat.governance_tasks (
	task_id serial4 NOT NULL, -- Unique surrogate identifier for the task instance.
	workflow_id int4 NULL, -- The workflow template being used for this task.
	current_stage_id int4 NULL, -- The active state of the task in the workflow.
	request_type_code varchar(20) NOT NULL, -- The category of the request (e.g., DQ_ISSUE, ACCESS_REQUEST).
	requester_user_id varchar(100) NOT NULL, -- The user who initiated the task.
	priority_code varchar(20) DEFAULT 'MEDIUM'::character varying NULL, -- Urgency level (e.g., LOW, MEDIUM, HIGH, URGENT).
	subject_text varchar(255) NOT NULL, -- A brief summary of the task.
	description_text text NULL, -- Detailed context or reason for the request.
	status_code varchar(20) DEFAULT 'OPEN'::character varying NULL, -- The global status (e.g., OPEN, IN_PROGRESS, RESOLVED, CANCELLED).
	current_stage_due_date date NULL, -- Calculated deadline for the current stage based on SLA.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- When the task was first created.
	CONSTRAINT governance_tasks_pkey PRIMARY KEY (task_id),
	CONSTRAINT governance_tasks_current_stage_id_fkey FOREIGN KEY (current_stage_id) REFERENCES bayanat.workflow_stages(stage_id),
	CONSTRAINT governance_tasks_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES bayanat.workflow_definitions(workflow_id)
);
COMMENT ON TABLE bayanat.governance_tasks IS 'The master record for a governance request, issue, or change request.';

-- Column comments

COMMENT ON COLUMN bayanat.governance_tasks.task_id IS 'Unique surrogate identifier for the task instance.';
COMMENT ON COLUMN bayanat.governance_tasks.workflow_id IS 'The workflow template being used for this task.';
COMMENT ON COLUMN bayanat.governance_tasks.current_stage_id IS 'The active state of the task in the workflow.';
COMMENT ON COLUMN bayanat.governance_tasks.request_type_code IS 'The category of the request (e.g., DQ_ISSUE, ACCESS_REQUEST).';
COMMENT ON COLUMN bayanat.governance_tasks.requester_user_id IS 'The user who initiated the task.';
COMMENT ON COLUMN bayanat.governance_tasks.priority_code IS 'Urgency level (e.g., LOW, MEDIUM, HIGH, URGENT).';
COMMENT ON COLUMN bayanat.governance_tasks.subject_text IS 'A brief summary of the task.';
COMMENT ON COLUMN bayanat.governance_tasks.description_text IS 'Detailed context or reason for the request.';
COMMENT ON COLUMN bayanat.governance_tasks.status_code IS 'The global status (e.g., OPEN, IN_PROGRESS, RESOLVED, CANCELLED).';
COMMENT ON COLUMN bayanat.governance_tasks.current_stage_due_date IS 'Calculated deadline for the current stage based on SLA.';
COMMENT ON COLUMN bayanat.governance_tasks.created_at_timestamp IS 'When the task was first created.';


-- bayanat.tag_assignments definition

-- Drop table

-- DROP TABLE bayanat.tag_assignments;

CREATE TABLE bayanat.tag_assignments (
	assignment_id serial4 NOT NULL, -- Unique identifier for the specific tag assignment instance.
	tag_id int4 NOT NULL, -- Reference to the specific tag being applied.
	asset_type_code varchar(50) NOT NULL, -- The category of the target asset (e.g., APPLICATION, DATA_SOURCE, SCHEMA, TABLE, COLUMN, GLOSSARY_TERM).
	asset_id int4 NOT NULL, -- The primary key value of the asset being tagged from its respective table.
	assigned_by_user_id varchar(100) NULL, -- The user identifier of the individual or system that applied the tag.
	assigned_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The exact time the tag was associated with the asset.
	CONSTRAINT tag_assignments_pkey PRIMARY KEY (assignment_id),
	CONSTRAINT uq_tag_asset UNIQUE (tag_id, asset_type_code, asset_id),
	CONSTRAINT tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES bayanat.tags(tag_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.tag_assignments IS 'A universal mapping table that associates tags from the tags table to any physical or business asset.';

-- Column comments

COMMENT ON COLUMN bayanat.tag_assignments.assignment_id IS 'Unique identifier for the specific tag assignment instance.';
COMMENT ON COLUMN bayanat.tag_assignments.tag_id IS 'Reference to the specific tag being applied.';
COMMENT ON COLUMN bayanat.tag_assignments.asset_type_code IS 'The category of the target asset (e.g., APPLICATION, DATA_SOURCE, SCHEMA, TABLE, COLUMN, GLOSSARY_TERM).';
COMMENT ON COLUMN bayanat.tag_assignments.asset_id IS 'The primary key value of the asset being tagged from its respective table.';
COMMENT ON COLUMN bayanat.tag_assignments.assigned_by_user_id IS 'The user identifier of the individual or system that applied the tag.';
COMMENT ON COLUMN bayanat.tag_assignments.assigned_at_timestamp IS 'The exact time the tag was associated with the asset.';


-- bayanat.task_activity_logs definition

-- Drop table

-- DROP TABLE bayanat.task_activity_logs;

CREATE TABLE bayanat.task_activity_logs (
	activity_id serial4 NOT NULL,
	task_id int4 NULL,
	from_stage_id int4 NULL,
	to_stage_id int4 NULL,
	action_result_code varchar(20) NULL,
	action_by_user_id varchar(100) NOT NULL,
	comment_text text NULL,
	activity_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT task_activity_logs_pkey PRIMARY KEY (activity_id),
	CONSTRAINT task_activity_logs_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES bayanat.workflow_stages(stage_id),
	CONSTRAINT task_activity_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES bayanat.governance_tasks(task_id),
	CONSTRAINT task_activity_logs_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES bayanat.workflow_stages(stage_id)
);


-- bayanat.task_assets definition

-- Drop table

-- DROP TABLE bayanat.task_assets;

CREATE TABLE bayanat.task_assets (
	task_asset_id serial4 NOT NULL, -- Unique surrogate identifier for the link.
	task_id int4 NOT NULL, -- Reference to the parent governance task.
	asset_type_code varchar(50) NOT NULL, -- The type of asset (e.g., DATA_ATTRIBUTES, DATA_ENTITIES).
	asset_id int4 NOT NULL, -- The primary key of the asset being acted upon.
	change_instruction_text text NULL, -- Specific notes for this individual asset (e.g., "Change description to X").
	CONSTRAINT task_assets_pkey PRIMARY KEY (task_asset_id),
	CONSTRAINT task_assets_task_id_fkey FOREIGN KEY (task_id) REFERENCES bayanat.governance_tasks(task_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.task_assets IS 'Intersection table linking a single task to multiple assets for batch processing.';

-- Column comments

COMMENT ON COLUMN bayanat.task_assets.task_asset_id IS 'Unique surrogate identifier for the link.';
COMMENT ON COLUMN bayanat.task_assets.task_id IS 'Reference to the parent governance task.';
COMMENT ON COLUMN bayanat.task_assets.asset_type_code IS 'The type of asset (e.g., DATA_ATTRIBUTES, DATA_ENTITIES).';
COMMENT ON COLUMN bayanat.task_assets.asset_id IS 'The primary key of the asset being acted upon.';
COMMENT ON COLUMN bayanat.task_assets.change_instruction_text IS 'Specific notes for this individual asset (e.g., "Change description to X").';


-- bayanat.task_comments definition

-- Drop table

-- DROP TABLE bayanat.task_comments;

CREATE TABLE bayanat.task_comments (
	comment_id serial4 NOT NULL, -- Unique surrogate identifier for the comment.
	task_id int4 NOT NULL, -- Reference to the parent task.
	stage_id int4 NULL, -- The workflow stage during which the comment was posted.
	user_id varchar(100) NOT NULL, -- The identifier of the user who made the comment.
	comment_text text NOT NULL, -- The actual message or feedback.
	created_at_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL, -- The timestamp when the comment was posted.
	CONSTRAINT task_comments_pkey PRIMARY KEY (comment_id),
	CONSTRAINT task_comments_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES bayanat.workflow_stages(stage_id),
	CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES bayanat.governance_tasks(task_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.task_comments IS 'Threaded business discussion regarding the task across its lifecycle.';

-- Column comments

COMMENT ON COLUMN bayanat.task_comments.comment_id IS 'Unique surrogate identifier for the comment.';
COMMENT ON COLUMN bayanat.task_comments.task_id IS 'Reference to the parent task.';
COMMENT ON COLUMN bayanat.task_comments.stage_id IS 'The workflow stage during which the comment was posted.';
COMMENT ON COLUMN bayanat.task_comments.user_id IS 'The identifier of the user who made the comment.';
COMMENT ON COLUMN bayanat.task_comments.comment_text IS 'The actual message or feedback.';
COMMENT ON COLUMN bayanat.task_comments.created_at_timestamp IS 'The timestamp when the comment was posted.';


-- bayanat.data_attributes definition

-- Drop table

-- DROP TABLE bayanat.data_attributes;

CREATE TABLE bayanat.data_attributes (
	attribute_id serial4 NOT NULL,
	entity_id int4 NULL,
	physical_name_text varchar(100) NOT NULL, -- The technical column name as defined in the DDL (e.g., cust_id_01).
	friendly_name_text varchar(255) NULL, -- A human-readable label synchronized with the Business Glossary term.
	attribute_class_code varchar(20) NULL, -- Differentiator between technical metadata (TECHNICAL) and business data (BUSINESS).
	data_type_text varchar(50) NOT NULL, -- The physical data type (e.g., VARCHAR, NUMERIC, BOOLEAN).
	is_primary_key_indicator bool DEFAULT false NULL, -- Indicates if this column is part of the Unique Primary Key for the table.
	is_nullable_indicator bool DEFAULT true NULL,
	default_value_text text NULL,
	description_text text NULL, -- Functional definition of the field, including calculation logic or validation rules.
	CONSTRAINT data_attributes_pkey PRIMARY KEY (attribute_id),
	CONSTRAINT data_attributes_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE
);
COMMENT ON TABLE bayanat.data_attributes IS 'Granular metadata for every column/field found within a Data Entity.';

-- Column comments

COMMENT ON COLUMN bayanat.data_attributes.physical_name_text IS 'The technical column name as defined in the DDL (e.g., cust_id_01).';
COMMENT ON COLUMN bayanat.data_attributes.friendly_name_text IS 'A human-readable label synchronized with the Business Glossary term.';
COMMENT ON COLUMN bayanat.data_attributes.attribute_class_code IS 'Differentiator between technical metadata (TECHNICAL) and business data (BUSINESS).';
COMMENT ON COLUMN bayanat.data_attributes.data_type_text IS 'The physical data type (e.g., VARCHAR, NUMERIC, BOOLEAN).';
COMMENT ON COLUMN bayanat.data_attributes.is_primary_key_indicator IS 'Indicates if this column is part of the Unique Primary Key for the table.';
COMMENT ON COLUMN bayanat.data_attributes.description_text IS 'Functional definition of the field, including calculation logic or validation rules.';

-- Table Triggers

create trigger trg_audit_data_attributes after
delete
    or
update
    on
    bayanat.data_attributes for each row execute function bayanat.fn_audit_metadata_changes();