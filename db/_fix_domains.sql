ALTER TABLE bayanat.business_glossaries DISABLE TRIGGER trg_audit_business_glossaries;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Covers all financial instruments, transactions, and reporting concepts including accounts receivable, invoicing, and payment processing.',
    classification_code = 'INTERNAL'
WHERE glossary_id = 1;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Human resources, workforce planning, headcount, compensation, and employee lifecycle management.',
    classification_code = 'CONFIDENTIAL'
WHERE glossary_id = 2;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Customer 360 profiles, marketing channels, segmentation, campaign metrics, and customer lifetime value.',
    classification_code = 'INTERNAL'
WHERE glossary_id = 3;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Data classification levels, PDPL obligations, data subject rights, and regulatory compliance controls.',
    classification_code = 'RESTRICTED'
WHERE glossary_id = 4;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Standardised KSA government reference codes for regions, cities, currencies, industry classifications (ISIC), and public-sector identifiers.',
    classification_code = 'PUBLIC'
WHERE glossary_id = 5;

ALTER TABLE bayanat.business_glossaries ENABLE TRIGGER trg_audit_business_glossaries;
