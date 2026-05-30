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
    // list page
    newRegister:        string;
    newRegisterModal:   string;
    registerNameLabel:  string;
    creating:           string;
    systemBadge:        string;
    deleteRegisterConfirm: string;
    columns:            string;
    entries:            string;
    open:               string;
    // detail page
    editEntry:          string;
    addEntryModal:      string;
    editColumnModal:    string;
    addColumnModal:     string;
    refresh:            string;
    loadingHistory:     string;
    noEntriesYet:       string;
    noHistoryYet:       string;
    tabEntries:         string;
    tabColumns:         string;
    moreColumns:        string;
    histDate:           string;
    histAction:         string;
    histEntry:          string;
    histChangedBy:      string;
    histSummary:        string;
    actionCreated:      string;
    actionUpdated:      string;
    actionDeleted:      string;
    colKey:             string;
    formDataType:       string;
    formOptions:        string;
    formRequired:       string;
    selectPlaceholder:  string;
    deleteEntryConfirm: string;
    deleteColumnConfirm:string;
  };

  // ── Data Governance overview ────────────────────────────────────────────────
  governance: {
    // main page
    pageTitle:    string;
    pageDesc:     string;
    // stat cards
    stats: {
      fwDocs:               string;
      acrossAllSections:    string;
      activeRegisters:      string;
      entriesTotal:         string;
      ndiCompliance:        string;
      noFramework:          string;
      frameworksTracked:    string;
      complianceFrameworks: string;
      requirements:         string;
    };
    // category cards
    framework:      string;
    frameworkDesc:  string;
    frameworkOpen:  string;
    registers:      string;
    registersDesc:  string;
    registersOpen:  string;
    compliance:     string;
    complianceDesc: string;
    complianceOpen: string;
    // framework section labels
    sectionLabels: {
      policy: string; process: string; strategy: string;
      roadmap: string; standard: string; training: string; regulatory: string;
    };
    // framework section descriptions
    sectionDescs: {
      policy: string; process: string; strategy: string;
      roadmap: string; standard: string; training: string; regulatory: string;
    };
    // framework document management
    fw: {
      addDocument:    string;
      editDocument:   string;
      noDocuments:    string;
      uploading:      string;
      titleRequired:  string;
      openArrow:      string;
      docs:           string;
      colTitle:       string;
      colStatus:      string;
      colVersion:     string;
      colEffective:   string;
      colOwner:       string;
      colFiles:       string;
      colOptions:     string;
      formTitle:      string;
      formDesc:       string;
      formStatus:     string;
      formVersion:    string;
      formEffective:  string;
      formExpiry:     string;
      formOwner:      string;
      statusDraft:    string;
      statusReview:   string;
      statusApproved: string;
      statusArchived: string;
    };
    // compliance assessment page
    ca: {
      pageTitle:        string;
      overallProgress:  string;
      tabAssessment:    string;
      // breadcrumb & step headers
      allDomains:       string;
      selectDomain:     string;
      selectStandard:   string;
      selectMaturity:   string;
      // stat cards
      complete:         string;
      totalReqs:        string;
      notCompleted:     string;
      // level picker cards
      levelOnly0:       string;
      levelRangePrefix: string;  // "Levels 1–"
      levelRangeSuffix: string;  // "included"
      levelItemsTotal:  string;
      levelDone:        string;
      // level selection state messages
      levelCurrently:   string;
      levelLowerWarn:   string;
      // level change warning modal
      changeMatTitle:   string;
      changeMatBody1:   string;
      changeMatBody2:   string;
      clearAbove:       string;
      // evidence table headers
      colLvl:           string;
      colCode:          string;
      colEvidence:      string;
      colType:          string;
      colAdmin:         string;
      colOwner:         string;
      colStatus:        string;
      colWorkflow:      string;
      colFile:          string;
      // step 4 stats row
      changeLevel:      string;
      statComplete:     string;
      statNotCompleted: string;
      statItems:        string;
      // evidence expanded labels
      admCriteria:      string;
      evidCode:         string;
      evidType:         string;
      opExcellence:     string;
      mgmtSector:       string;
      comments:         string;
      saveChanges:      string;
      approveWorkflow:  string;
      saveAsDraft:      string;
      submitReview:     string;
      confirmAction:    string;
      endorseAction:    string;
      fullyEndorsed:    string;
      // workflow statuses
      wfDraft:          string;
      wfSubmitted:      string;
      wfConfirmed:      string;
      wfEndorsed:       string;
      // collab panel
      discussions:      string;
      startDiscussion:  string;
      postBtn:          string;
      noDiscussions:    string;
      // history panel
      changeHistory:    string;
      noHistory:        string;
      histDate:         string;
      histField:        string;
      histPrevious:     string;
      histNewValue:     string;
      histChangedBy:    string;
      // configuration tab
      cfgLevelTitle:    string;
      cfgLevelDesc:     string;
      cfgDomainTitle:   string;
      cfgDomainDesc:    string;
      cfgAutoTranslate: string;
      cfgTranslating:   string;
      cfgAddDomain:     string;
    };
  };

  // ── Dashboard ───────────────────────────────────────────────────────────────
  dashboard: {
    welcome:           string;   // supports {name} placeholder
    overallCompliance: string;
    overallMaturity:   string;
    ndomoDomains:      string;
    lastPeriod:        string;
    noTrendData:       string;
    stats: {
      specsTracked:    string;
      domainsActive:   string;
      controlsPassing: string;
      openFindings:    string;
    };
    search: {
      placeholder:     string;
      button:          string;
      filtering:       string;
      clear:           string;
      tags:            string;
      steward:         string;
      searching:       string;
      noResults:       string;
      seeAll:          string;
      recentSearches:  string;
      recentlyVisited: string;
      searchUser:      string;
      result:          string;
      results:         string;
    };
    domainCard: {
      compliance: string;
      maturity:   string;
    };
    assetTypes: {
      table:   string; view:   string; column:  string;
      schema:  string; source: string; term:    string;
      tables:  string; views:  string; columns: string;
      schemas: string; sources: string; terms:  string;
    };
  };
};
