-- Custom Attributes — admin-defined, per-asset-type metadata fields, on top of
-- the native catalog asset types (not to be confused with the Custom Asset
-- Framework's custom_asset_type_attributes, which defines fields for entirely
-- new asset TYPES like Customer/Activity — this is for fields on the existing
-- native ones). Mirrors that framework's data_type_code vocabulary and
-- enum-values-as-jsonb pattern for a consistent admin/rendering experience.

CREATE TABLE IF NOT EXISTS bayanat.custom_attribute_definitions (
  attr_def_id           serial4 PRIMARY KEY,
  asset_type_code       varchar(30)  NOT NULL,
  attr_code             varchar(30)  NOT NULL,
  attr_name_text        varchar(100) NOT NULL,
  name_ar_text          varchar(100),
  data_type_code        varchar(20)  NOT NULL,
  enum_values_json      jsonb,
  is_required_indicator boolean NOT NULL DEFAULT false,
  is_enabled_indicator  boolean NOT NULL DEFAULT true,
  display_order_int     int2    NOT NULL DEFAULT 0,
  created_by_user_id    varchar(100),
  created_at            timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_custom_attr_def UNIQUE (asset_type_code, attr_code),
  CONSTRAINT chk_custom_attr_asset_type CHECK (
    asset_type_code IN ('DATA_SOURCES','DATA_SCHEMAS','DATA_ENTITIES','DATA_ATTRIBUTES','BUSINESS_GLOSSARIES')
  ),
  CONSTRAINT chk_custom_attr_data_type CHECK (
    data_type_code IN ('TEXT','LONGTEXT','NUMBER','DATE','BOOLEAN','ENUM','USER','URL')
  )
);

-- One row per asset instance, values keyed by attr_code — same
-- values-as-a-single-jsonb-blob shape as bayanat.custom_assets.attributes_json,
-- so both features share the same read/render logic where useful.
CREATE TABLE IF NOT EXISTS bayanat.custom_attribute_values (
  asset_type_code    varchar(30) NOT NULL,
  asset_id           int4        NOT NULL,
  values_json        jsonb NOT NULL DEFAULT '{}',
  updated_by_user_id varchar(100),
  updated_at         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_type_code, asset_id)
);
