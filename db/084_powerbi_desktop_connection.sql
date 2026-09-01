-- .pbix upload lineage needs a POWERBI-type connection_registry row to attach
-- scan runs/edges to (only a FABRIC tenant row existed before this).
INSERT INTO bayanat.connection_registry (connection_name, db_type_code, host_address, port_number, database_name, lineage_enabled)
SELECT 'PowerBI_Service_Tenant', 'POWERBI', 'api.powerbi.com', 443, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM bayanat.connection_registry WHERE db_type_code = 'POWERBI');
