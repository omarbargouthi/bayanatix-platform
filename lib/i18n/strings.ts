/**
 * Master type definition for all translatable UI strings.
 * Every string that appears in the UI should have an entry here.
 * Add a key, then fill in values in en.ts and ar.ts.
 */
export type I18nStrings = {

  // ── Sidebar navigation ──────────────────────────────────────────────────────
  nav: {
    // Top section
    dashboard:        string;
    homepage:         string;
    reports:          string;
    // Domain modules
    governance:       string;
    catalog:          string;
    quality:          string;
    classification:   string;
    privacy:          string;
    sharing:          string;
    foi:              string;
    aiGovernance:     string;
    // Admin section items
    userManagement:   string;
    workflows:        string;
    dataSources:      string;
    auditLogs:        string;
    configuration:    string;
    // Compliance sub-items
    complianceConfig: string;
    indexSetup:       string;
    // Bottom
    support:          string;
    settings:         string;
    // Section group headers
    sectionDomains:   string;
    sectionAdmin:     string;
    sectionCompliance:string;
  };

  // ── User role labels ────────────────────────────────────────────────────────
  roles: {
    ADMIN:   string;
    STEWARD: string;
    OFFICER: string;
    VIEWER:  string;
  };

  // ── Global / shared actions & messages ─────────────────────────────────────
  common: {
    save:        string;
    cancel:      string;
    delete:      string;
    edit:        string;
    add:         string;
    close:       string;
    search:      string;
    loading:     string;
    saving:      string;
    confirm:     string;
    yes:         string;
    no:          string;
    export:      string;
    import:      string;
    back:        string;
    noData:      string;
    actions:     string;
    required:    string;
    optional:    string;
    name:        string;
    description: string;
    status:      string;
    type:        string;
    code:        string;
    level:       string;
    date:        string;
    by:          string;
    history:     string;
  };

  // ── Compliance Assessment ───────────────────────────────────────────────────
  compliance: {
    pageTitle:        string;
    tabs: {
      assessment:     string;
      configuration:  string;
      indexSetup:     string;
    };
    stats: {
      total:          string;
      complete:       string;
      na:             string;
      notCompleted:   string;
    };
    overallProgress:  string;
    // Navigation steps
    steps: {
      selectDomain:   string;
      selectStandard: string;
      selectLevel:    string;
    };
    // Evidence table columns
    table: {
      level:          string;
      code:           string;
      supportingEvidence: string;
      type:           string;
      evidentAdmin:   string;
      domainOwner:    string;
      status:         string;
      workflow:       string;
      discussions:    string;
      file:           string;
    };
    // Expanded row labels
    evidence: {
      admissionCriteria:      string;
      evidenceCode:           string;
      evidenceType:           string;
      operationalExcellence:  string;
      management:             string;
      comments:               string;
      uploadEvidence:         string;
    };
    // Workflow section
    workflow: {
      title:          string;
      saveAsDraft:    string;
      submitReview:   string;
      confirm:        string;
      endorse:        string;
      endorsed:       string;
    };
    // Edit requirement dialog
    editDialog: {
      title:                  string;
      question:               string;
      supportingEvidence:     string;
      admissionCriteria:      string;
      management:             string;
      evidenceType:           string;
      evidenceCode:           string;
      complianceOrMaturity:   string;
      maturityLevel:          string;
      evidentAdmin:           string;
      domainOwner:            string;
    };
  };

  // ── Configuration tab ───────────────────────────────────────────────────────
  config: {
    levelConfigTitle:       string;
    levelConfigDesc:        string;
    domainConfigTitle:      string;
    domainConfigDesc:       string;
    autoTranslateAr:        string;
    table: {
      level:          string;
      color:          string;
      nameEn:         string;
      nameAr:         string;
      descriptionEn:  string;
      descriptionAr:  string;
      domainCode:     string;
    };
    groups: {
      statuses:       string;
      evidenceTypes:  string;
      complianceTypes:string;
    };
  };

  // ── Registers ───────────────────────────────────────────────────────────────
  registers: {
    pageTitle:          string;
    addEntry:           string;
    addColumn:          string;
    columnName:         string;
    columnType:         string;
    columnRequired:     string;
    noEntries:          string;
    noColumns:          string;
    history:            string;
  };

  // ── Data Governance overview ────────────────────────────────────────────────
  governance: {
    pageTitle:          string;
    registers:          string;
    compliance:         string;
  };
};
