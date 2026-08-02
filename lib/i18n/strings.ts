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
    lineage:          string;
    quality:          string;
    classification:   string;
    columnTypes:      string;
    enrichment:       string;
    privacy:          string;
    sharing:          string;
    openData:         string;
    foi:              string;
    aiGovernance:     string;
    // Admin section items
    userManagement:   string;
    workflows:        string;
    dataSources:      string;
    auditLogs:        string;
    configuration:       string;
    maturityIndexSetup:  string;
    // Compliance sub-items (kept for backward compat)
    complianceConfig: string;
    indexSetup:       string;
    // Bottom
    support:          string;
    settings:         string;
    // Section group headers
    sectionDomains:    string;
    sectionAdmin:      string;
    sectionCompliance: string;
    sectionStandalone: string;
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

  // ── Data Catalog ────────────────────────────────────────────────────────────
  catalog: {
    pageTitle:        string;
    pageDesc:         string;
    filterBtn:        string;
    exportBtn:        string;
    // Coverage cards
    sqlCoverage:      string;
    sqlLinked:        string;
    metadataQuality:  string;
    dataQuality:      string;
    score:            string;
    descFilled:       string;
    ownersAssigned:   string;
    glossaryLinked:   string;
    completeness:     string;
    validity:         string;
    uniqueness:       string;
    // Asset tree / glossaries
    dataAssets:       string;
    glossaries:       string;
    sortBtn:          string;
    newTerm:          string;
    sources:          string;
    records:          string;
    tables:           string;
    schemas:          string;
    terms:            string;
    categories:       string;
    approved:         string;
    linkedAssets:     string;
    termsCount:       string;
    // Schema sub-page tabs
    tabTables:        string;
    tabDataModel:     string;
    // SchemaHero
    cdes:             string;
    businessLinked:   string;
    inThisSchema:     string;
    tagsLabel:        string;
    businessTerms:    string;
    ratingLabel:      string;
    noDescSchema:     string;
    // SchemaTableList toolbar
    searchTables:     string;
    allTypes:         string;
    allStatuses:      string;
    ofTables:         string;
    noTablesFilter:   string;
    // Table column headers
    colAssetName:     string;
    colType:          string;
    colCertification: string;
    colStewards:      string;
    colTrust:         string;
    colRating:        string;
    // Expanded row sections
    description:      string;
    qualityIndicators:string;
    trustScore:       string;
    usageMetrics30:   string;
    queries:          string;
    uniqueUsers:      string;
    avgQueryMs:       string;
    incidentScale:    string;
    properties:       string;
    physicalName:     string;
    friendlyName:     string;
    metadataCert:     string;
    dataCert:         string;
    stewards:         string;
    usageAutomated:   string;
    rowCount:         string;
    columns:          string;
    assetKind:        string;
    viewFullTable:    string;
    noDescTable:      string;
    noDescTableEdit:  string;
    assetRating:      string;
    viewsLabel:       string;
    // Table Edit Modal
    editTableMeta:    string;
    editFriendlyName: string;
    editDesc:         string;
    tableTypeLabel:   string;
    // Table type values
    typeTransactional:string;
    typeMaster:       string;
    typeReference:    string;
    typeSetup:        string;
    typeSystem:       string;
    typeNone:         string;
    // Table type suggestion (crawler-suggested, pending steward review)
    suggestedTypePrefix: string;   // "Suggested:" — prepended to the type label
    suggestedTypeTitle:  string;   // tooltip explaining where the suggestion came from
    acceptSuggestion:    string;
    changeSuggestion:    string;
    confidenceHigh:      string;
    confidenceMedium:    string;
    confidenceLow:       string;
    // Column Asset-Type suggestion (Business/Technical, distinct from table type above)
    suggestedColumnTypeTitle: string;
    overrideReasonLabel:      string;
    overrideReasonPlaceholder: string;
    overrideConfirmBtn:       string;
    addPatternExceptionLabel: string;
    columnTypeBusiness:       string;
    columnTypeTechnical:      string;
    // Cert filter
    certAllStatus:    string;
    certGold:         string;
    certSilver:       string;
    certBronze:       string;
    certUncertified:  string;
    // Picker / widget labels
    addTags:           string;
    loadingTags:       string;
    noTagsDefined:     string;
    linkTerms:         string;
    loadingTerms:      string;
    searchTerms:       string;
    noTermsMatch:      string;
    noRatingsYet:      string;
    rateAsset:         string;
    yourRating:        string;
    submitRating:      string;
    addCommentOpt:     string;
    // Classification codes
    classPublic:       string;
    classInternal:     string;
    classConfidential: string;
    classRestricted:   string;
    classPii:          string;
    classSecret:       string;
    classTopSecret:    string;
    // Column edit modal
    fromSource:        string;
    columnTypeLabel:   string;
    colBusinessTerm:   string;
    encryptedField:    string;
    saveChanges:       string;
    viewHistory:       string;
    // Table detail page tabs
    tabSchema:         string;
    tabDataQuality:    string;
    tabActivity:       string;
    tabLineage:        string;
    tabRelationships:  string;
    tabSampleData:     string;
    tabCustomProps:    string;
    // TableEditPanel
    descLabel:         string;
    fromSourceSystem:  string;
    noDescYet:         string;
    noCommentSrc:      string;
    // TableDqTab
    dqScore:           string;
    dqRunAll:          string;
    dqAddRule:         string;
    dqRunAllRunning:   string;
    dqPassing:         string;
    dqWarnings:        string;
    dqFailing:         string;
    dqNotYetRun:       string;
    dqAboveThresh:     string;
    dqNearThresh:      string;
    dqBelowThresh:     string;
    dqFailRecords:     string;
    dqNoRules:         string;
    dqAddFirst:        string;
    dqLoading:         string;
    dqRunBtn:          string;
    dqRetryBtn:        string;
    dqApplyAt:         string;
    dqTableLvl:        string;
    dqColumnLvl:       string;
    dqPreSelected:     string;
    dqSelectCols:      string;
    dqExecErrors:      string;
    dqNotifyFail:      string;
    dqAutoOpenFail:    string;
    dqFirstBaseline:   string;
    dqVsPrevRun:       string;
    // Table page — governance panel
    governanceRoles:   string;
    editRoles:         string;
    doneEditing:       string;
    noRolesAssigned:   string;
    noneAssigned:      string;
    // Table page — columns table
    attributes:        string;
    colColumn:         string;
    colNullPct:        string;
    colUniquePct:      string;
    colDistinct:       string;
    colMin:            string;
    colMax:            string;
    colTopValues:      string;
    colSensitivity:    string;
    colGlossary:       string;
    colQuality:        string;
    // Table page — profiling panel
    dataProfile:       string;
    lastRun:           string;
    totalRows:         string;
    sampled:           string;
    colsProfiled:      string;
    noProfilingData:   string;
    // Table page — compliance gauge
    complianceScore:      string;
    piiColumns:           string;
    classificationLabel:  string;
    retentionLabel:       string;
    pdplStatus:           string;
  };

  // ── Data Quality ─────────────────────────────────────────────────────────────
  dq: {
    // Tabs
    tabDashboard:     string;
    tabRules:         string;
    tabRuns:          string;
    // Dashboard stat cards
    totalRules:       string;
    activeRules:      string;
    runsToday:        string;
    passing:          string;
    failing:          string;
    avgScore:         string;
    // Dashboard sections
    runTrends:        string;
    trendPassed:      string;
    trendFailed:      string;
    rulesByDim:       string;
    rulesCount:       string;
    failingWarning:   string;
    allPassing:       string;
    noRulesYet:       string;
    noRunHistory:     string;
    // Rule Library toolbar
    allDimensions:    string;
    allStatuses:      string;
    activeOnly:       string;
    failingFilter:    string;
    passingFilter:    string;
    newRule:          string;
    noRulesMatch:     string;
    createFirstRule:  string;
    // Rule table headers
    colRule:          string;
    colDimension:     string;
    colAsset:         string;
    colSeverity:      string;
    colScore:         string;
    colStatus:        string;
    colSchedule:      string;
    colActions:       string;
    // Row actions
    runBtn:           string;
    running:          string;
    editBtn:          string;
    pauseBtn:         string;
    enableBtn:        string;
    delBtn:           string;
    rerunBtn:         string;
    neverRun:         string;
    // Run History
    recentRuns:       string;
    refreshBtn:       string;
    colTimestamp:     string;
    colScanned:       string;
    colPassed:        string;
    colFailed:        string;
    colDetail:        string;
    detailBtn:        string;
    noRunsYet:        string;
    // Rule form modal
    editRuleTitle:    string;
    newRuleTitle:     string;
    ruleNameLabel:    string;
    severityLabel:    string;
    targetAssets:     string;
    browseAssets:     string;
    changeAsset:      string;
    changeAddAssets:  string;
    dqDimensionLabel: string;
    ruleTemplate:     string;
    customSql:        string;
    customSqlDesc:    string;
    scoreThresholds:  string;
    warnBelow:        string;
    failBelow:        string;
    schedCron:        string;
    actionsOnFail:    string;
    notifyOwners:     string;
    autoOpenIssue:    string;
    createRuleBtn:    string;
    saveChangesBtn:   string;
    // Severity options
    severityInfo:     string;
    severityWarning:  string;
    severityCritical: string;
    // Run detail modal
    valueSamples:     string;
    validValues:      string;
    invalidValues:    string;
    loadingSamples:   string;
    noSamples:        string;
    // Status labels
    statusPassed:     string;
    statusFailed:     string;
    statusError:      string;
    statusWarning:    string;
    statusPaused:     string;
  };

  // ── Business Glossary ───────────────────────────────────────────────────────
  glossary: {
    pageTitle:          string;
    pageDesc:           string;
    exportBtn:          string;
    newTerm:            string;
    totalTerms:         string;
    domains:            string;
    linkedAttrs:        string;
    piiTerms:           string;
    domainsTitle:       string;
    allTerms:           string;
    filterBtn:          string;
    sortBtn:            string;
    colTerm:            string;
    colDomain:          string;
    colDefinition:      string;
    colClassification:  string;
    colPii:             string;
    colAliases:         string;
    colLinked:          string;
    noTermsFound:       string;
    alsoKnownAs:        string;
    requestChange:      string;
    follow:             string;
    sectionDefinition:  string;
    sectionBizRules:    string;
    sectionFormat:      string;
    sectionLinkedAttrs: string;
    formatLabel:        string;
    exampleValue:       string;
    propDomain:         string;
    propTermType:       string;
    propPii:            string;
    propPiCategory:     string;
    propNpiCategory:    string;
    propCreated:        string;
    propLinkedCols:     string;
    propRetentionCategory: string;
    retentionInherited: string;
    yesPersonalData:    string;
    noPersonalData:     string;
    termTypeTerm:       string;
    termTypeKpi:        string;
    colColumn:          string;
    colTable:           string;
    colType:            string;
    synonymsTitle:      string;
    noLinkedColsYet:    string;
    newTermModalTitle:  string;
    termNameLabel:      string;
    termDefLabel:       string;
    domainLabel:        string;
    creating:           string;
    propertiesSection:  string;
  };

  // ── Data Retention ───────────────────────────────────────────────────────────
  retention: {
    pageTitle:          string;
    pageDesc:           string;
    tabCategories:      string;
    tabLegalHolds:      string;
    tabOverview:        string;
    // Categories
    categoriesTitle:    string;
    addCategory:        string;
    addSubcategory:     string;
    editCategory:       string;
    categoryName:       string;
    categoryNameAr:     string;
    sensitivity:        string;
    schedules:          string;
    entities:           string;
    noCategories:       string;
    // Schedule panel
    schedulesTitle:     string;
    addSchedule:        string;
    jurisdiction:       string;
    triggerEvent:       string;
    period:             string;
    action:             string;
    reference:          string;
    defaultSchedule:    string;
    noSchedules:        string;
    deleteSchedule:     string;
    // Retention units
    unitDays:           string;
    unitMonths:         string;
    unitYears:          string;
    // Post-retention actions
    actionDelete:       string;
    actionAnonymize:    string;
    actionArchive:      string;
    actionReview:       string;
    // Legal Holds
    legalHoldsTitle:    string;
    newHold:            string;
    caseReference:      string;
    caseName:           string;
    scopeType:          string;
    holdDate:           string;
    releaseDate:        string;
    holdStatus:         string;
    placedBy:           string;
    releaseHold:        string;
    releaseJustification: string;
    affectedCategories: string;
    noLegalHolds:       string;
    statusActive:       string;
    statusReleased:     string;
    statusExpired:      string;
    scopeCategory:      string;
    scopeEntity:        string;
    scopeGlobal:        string;
    // Overview
    overviewTitle:      string;
    totalCategories:    string;
    totalSchedules:     string;
    activeHolds:        string;
    classified:         string;
    unclassified:       string;
    expiringSoon:       string;
    overdue:            string;
    coverageTitle:      string;
    sensitivityDist:    string;
    retentionStatusDist: string;
    // Sensitivity labels
    sensitivityPublic:      string;
    sensitivityInternal:    string;
    sensitivityConfidential:string;
    sensitivityRestricted:  string;
    sensitivitySecret:      string;
    sensitivityTopSecret:   string;
  };

  // ── Open Data ───────────────────────────────────────────────────────────────
  openData: {
    // List page
    pageTitle:              string;
    pageDesc:               string;
    newDataset:             string;
    tabAll:                 string;
    searchPlaceholder:      string;
    noDatasets:             string;
    createFirst:            string;
    colDataset:             string;
    colCategory:            string;
    colFormat:              string;
    colRefresh:             string;
    colColumns:             string;
    colStatus:              string;
    deleteBtn:              string;
    retractBtn:             string;
    deletingEllipsis:       string;
    confirmDelete:          string;
    confirmRetract:         string;
    deleteError:            string;
    datasetsTotal:          string;
    prevPage:               string;
    nextPage:               string;
    pageOf:                 string;
    // Status labels
    statusDraft:            string;
    statusPendingApproval:  string;
    statusApproved:         string;
    statusPublished:        string;
    statusRejected:         string;
    statusPending:          string;
    // Refresh frequency
    refreshMonthly:         string;
    refreshQuarterly:       string;
    refreshHalfYearly:      string;
    refreshYearly:          string;
    refreshOnDemand:        string;
    // Editor — header / actions
    titleCreate:            string;
    containsPii:            string;
    saveDraft:              string;
    savedCheck:             string;
    savingLabel:            string;
    submitApproval:         string;
    submittingLabel:        string;
    addColumnFirst:         string;
    revertPending:          string;
    revertPendingBtn:       string;
    // Editor — tabs
    tabInfo:                string;
    tabColumns:             string;
    tabExtraction:          string;
    tabApproval:            string;
    // Editor — Dataset Info tab
    sectionBasic:           string;
    sectionBasicSub:        string;
    fieldName:              string;
    fieldNamePlaceholder:   string;
    fieldDesc:              string;
    fieldDescPlaceholder:   string;
    fieldDept:              string;
    fieldDeptPlaceholder:   string;
    fieldCategory:          string;
    selectCategory:         string;
    fieldPurpose:           string;
    fieldPurposePlaceholder:string;
    sectionPublication:     string;
    fieldSegments:          string;
    fieldSegmentsHint:      string;
    fieldPublishDate:       string;
    fieldCoverageFrom:      string;
    fieldCoverageFromPh:    string;
    fieldCoverageTo:        string;
    fieldCoverageToPh:      string;
    fieldFormats:           string;
    fieldSize:              string;
    fieldSizeHint:          string;
    fieldSizePh:            string;
    fieldRefreshFreq:       string;
    selectFrequency:        string;
    sectionDqNotes:         string;
    sectionDqNotesSub:      string;
    fieldDqNotes:           string;
    fieldDqNotesPh:         string;
    saveBtn:                string;
    // Editor — Columns tab
    sectionColumns:         string;
    sectionColumnsSub:      string;
    saveFirstWarning:       string;
    saveNow:                string;
    // Editor — Extraction tab
    sectionExtraction:      string;
    sectionExtractionSub:   string;
    noColumnsExtraction:    string;
    regenerateBtn:          string;
    // Editor — Approval tab
    sectionApproval:        string;
    sectionApprovalSub:     string;
    stageLabel:             string;
    stageStewardReview:     string;
    stageOwnerApproval:     string;
    stagePrivacyReview:     string;
    stageDmoSignoff:        string;
    roleSteward:            string;
    roleOwner:              string;
    rolePrivacy:            string;
    roleDmo:                string;
    skippedNoPii:           string;
    currentStatus:          string;
    statusDescDraft:        string;
    statusDescPending:      string;
    statusDescPendingApproval: string;
    statusDescApproved:     string;
    statusDescPublished:    string;
    statusDescRejected:     string;
    privacyNotice:          string;
    privacyNoticeText:      string;
    // Editor — errors
    errNameRequired:        string;
    errCreateFailed:        string;
    errSaveFailed:          string;
    errSubmitFailed:        string;
    // Beneficiary segments
    segments: {
      investors:              string;
      researchers:            string;
      government:             string;
      media:                  string;
      citizens:               string;
      ngos:                   string;
      privateSector:          string;
      students:               string;
      internationalOrgs:      string;
    };
    // Column picker — search area
    searchColumnsLabel:     string;
    searchColumnsPh:        string;
    searchingLabel:         string;
    directIdBadge:          string;
    piiDeIdBadge:           string;
    needsReclassBadge:      string;
    notClassifiedBadge:     string;
    cannotAddBtn:           string;
    addDeidentifyBtn:       string;
    addReclassifyBtn:       string;
    addClassifyBtn:         string;
    addBtn:                 string;
    addedBtn:               string;
    noColumnsFound:         string;
    directIdBlockedError:   string;
    // Column picker — selected columns
    selectedColumnsLabel:   string;
    noColumnsSelected:      string;
    noColumnsHint:          string;
    // Column picker — direct identifier banner
    directIdBannerText:     string;
    // Column picker — PII de-identification banners
    piiDeIdRequiredText:    string;
    setDeidentifyBtn:       string;
    deidentifiedPrefix:     string;
    changeDeidentBtn:       string;
    clearDeidentBtn:        string;
    directIdentifierBadge:  string;
    piiBadge:               string;
    // Column picker — classification banners
    noClassBannerText:      string;
    assignClassBtn:         string;
    needsReclassBannerText: string;
    reclassPublicBtn:       string;
    reclassPendingText:     string;
    // Column picker — de-identification form
    deidentFormTitle:       string;
    deidentFormDesc:        string;
    deidentMethodLabel:     string;
    selectDeidentMethod:    string;
    deidentAgeBracket:      string;
    deidentSalaryBracket:   string;
    deidentCityOnly:        string;
    deidentDateYear:        string;
    deidentPseudonymization:string;
    deidentGeneralization:  string;
    deidentCustom:          string;
    deidentCustomNotesLabel:string;
    deidentCustomNotesPh:   string;
    saveDeidentBtn:         string;
    savingDeidentBtn:       string;
    // Column picker — reclassify form
    reclassFormTitleReclass:string;
    reclassFormTitleAssign: string;
    reclassFormDescReclass: string;
    reclassFormDescNoClass: string;
    reclassTermLabel:       string;
    reclassTermPh:          string;
    reclassTermLoading:     string;
    reclassReasonLabel:     string;
    reclassReasonPh:        string;
    submitReclassBtn:       string;
    submitClassBtn:         string;
    submittingReclassBtn:   string;
    // Column picker — DQ rules
    dqRulesLabel:           string;
    dqNotRun:               string;
    dqAddIssueBtn:          string;
    dqNoRules:              string;
    dqRuleCount:            string;
    dqLoading:              string;
    dqIssueBtn:             string;
    // Column picker — DQ issue form
    dqIssueNotesLabel:      string;
    dqEditIssueTitle:       string;
    dqAddIssueTitle:        string;
    dqDimensionPh:          string;
    dqSeverityInfo:         string;
    dqSeverityWarning:      string;
    dqSeverityBlocker:      string;
    dqIssuePh:              string;
    dqSaveChangesBtn:       string;
    dqSaveIssueBtn:         string;
  };

  // ── Relationships (catalog mind-map) ───────────────────────────────────────
  relationships: {
    tabTitlePrefix: string;   // "Relationships" — rendered as "{tabTitlePrefix} · {name}"
    expandAll:      string;
    collapseAll:    string;
    canvasHint:     string;
    loadFailed:     string;
    emptyTitle:     string;
    emptyDesc:      string;
    currentAsset:   string;
    rowsSuffix:     string;   // "{n} rows"
    moreSuffix:     string;   // "+{n} more"
    hideCategory:   string;   // "Hide {name}"
    showCategory:   string;   // "Show {name}"
    badges: {
      table:  string;
      view:   string;
      column: string;
    };
    groups: {
      terms:       string;
      tags:        string;
      dq:          string;
      requests:    string;
      stewards:    string;
      lineage:     string;
      openData:    string;
      dataSharing: string;
      parentTable: string;
    };
  };

  // ── Data Lineage graph ──────────────────────────────────────────────────────
  lineage: {
    searchPlaceholder: string;
    tableLevel:         string;
    columnLevel:         string;
    upstreamLabel:       string;   // "Upstream {n}"
    downstreamLabel:     string;   // "Downstream {n}"
    emptyPrompt:         string;
    loadingLineage:      string;
    canvasHint:          string;
    currentAsset:        string;
    loadingColumns:      string;
    layers: {
      source:    string;
      raw:       string;
      staging:   string;
      table:     string;
      view:      string;
      dashboard: string;
    };
    detail: {
      quality:    string;
      owner:      string;
      rows:       string;
      columns:    string;
      downstream: string;
      upstream:   string;
    };
    quality: {
      good:     string;
      unknown:  string;
      critical: string;
      warning:  string;
    };
    edge: {
      transformation: string;
      process:        string;
      autoScanned:    string;
      manual:         string;
      confirm:        string;
      confirming:     string;
      confirmed:      string;
    };
    impact: {
      titleDownstream: string;
      titleUpstream:   string;
      fromLabel:       string;   // "from {name}"
      loading:         string;
      assets:          string;
      layers:          string;
      dqIssues:        string;
      noneDownstream:  string;
      noneUpstream:    string;
      hopLabel:        string;   // "Hop {n}"
      schemaLabel:     string;   // "Schema: {name}"
      ownerLabel:      string;   // "Owner: {name}"
      viaLabel:        string;   // "via {name}"
      exportCsv:       string;
    };
  };

  // ── Data Sharing Agreements ─────────────────────────────────────────────────
  sharing: {
    // Registry (list) page
    pageTitle:        string;
    pageDesc:         string;
    newAgreement:     string;
    creatingEllipsis: string;
    summaryActive:    string;
    summaryPending:   string;
    summaryExpiring:  string;
    searchPlaceholder:string;
    allStatuses:      string;
    allScopes:        string;
    colAgreement:     string;
    colCounterparty:  string;
    colScope:         string;
    colMaxClass:      string;
    colDatasets:      string;
    colExpiry:        string;
    colStatus:        string;
    noAgreements:     string;
    createFirst:      string;
    notSet:           string;
    deleteDraftTitle: string;
    agreementsTotal:  string;   // "{n} agreements"
    prevPage:         string;
    nextPage:         string;
    pageOf:           string;   // "Page {page} / {total}"
    deleteConfirm:    string;   // 'Delete "{title}"? This cannot be undone.'
    piBadge:          string;

    // Editor shell
    backToAgreements:    string;
    newAgreementTitle:   string;
    expiresLabel:        string;  // "Expires {date}"
    containsPersonalData:string;
    submitForApproval:   string;
    validatingEllipsis:  string;
    readinessFailedTitle:string;
    submittedSuccess:    string;
    unexpectedError:     string;
    serverErrorTemplate: string;  // "Server error (HTTP {status})"
    tabGeneral:          string;
    tabDatasets:         string;
    tabTerms:            string;
    tabAuthorizations:   string;
    tabApprovals:        string;
    selectPlaceholder:   string;
    savedCheck:          string;

    general: {
      sectionDetails:       string;
      fieldTitle:           string;
      fieldTitlePh:         string;
      fieldScope:           string;
      fieldDirection:       string;
      internalParties:      string;
      fieldFromDept:        string;
      fieldFromDeptPh:      string;
      fieldToDept:          string;
      fieldToDeptPh:        string;
      fieldCounterparty:    string;
      fieldCounterpartyPh:  string;
      fieldPurpose:         string;
      fieldPurposePh:       string;
      fieldLegalBasis:      string;
      fieldLegalBasisPh:    string;
      sectionParams:        string;
      fieldStart:           string;
      fieldEnd:             string;
      fieldFrequency:       string;
      fieldMethod:          string;
      fieldFormat:          string;
      fieldPdplRole:        string;
      crossBorderLabel:     string;
      crossBorderWarning:   string;
      directionProviderFull:      string;
      directionRequesterFull:     string;
      directionBidirectionalFull: string;
      roleController: string;
      roleProcessor:  string;
      roleMixed:      string;
    };

    freq: {
      oneTime:  string;
      daily:    string;
      weekly:   string;
      monthly:  string;
      onDemand: string;
      realTime: string;
    };
    method: {
      api:             string;
      sftp:            string;
      gsb:             string;
      securePortal:    string;
      encryptedMedia:  string;
      directDbLink:    string;
    };
    format: {
      json:    string;
      xml:     string;
      csv:     string;
      parquet: string;
      xlsx:    string;
      pdf:     string;
      other:   string;
    };

    terms: {
      sectionSecurity:          string;
      fieldSecurityControls:    string;
      fieldSecurityControlsPh:  string;
      fieldStorageConditions:   string;
      fieldStorageConditionsPh: string;
      sectionObligations:       string;
      fieldDestruction:         string;
      fieldDestructionPh:       string;
      fieldLiability:           string;
      fieldLiabilityPh:         string;
      fieldReview:              string;
      fieldReviewPh:            string;
      sectionReferences:        string;
      fieldRiskRef:             string;
      fieldRiskRefPh:           string;
      riskRefHint:              string;
      fieldSignedDoc:           string;
      fieldSignedDocPh:         string;
      signedDocHint:            string;
    };

    approvals: {
      emptyState:            string;
      progressTitle:         string;
      progressDesc:          string;
      currentStatusLabel:    string;  // "Current status: {status}"
      optionalLabel:         string;
      commentsLabel:         string;
      commentsPhApproved:    string;
      commentsPhOther:       string;
      delegationRefLabel:    string;
      delegationRefPh:       string;
      recordDecisionBtn:     string;
      confirmBtn:            string;
      commentsRequiredAlert: string;
      decisionFailedError:   string;
      slaNote:               string;
      station: {
        dataOwner:    string;
        dataPrivacy:  string;
        dmoReview:    string;
        execDelegate: string;
      };
      decision: {
        pending:  string;
        approved: string;
        rejected: string;
        returned: string;
      };
    };

    auth: {
      processorNoticeTitle: string;
      processorNoticeText:  string;
      controllerNoticeTitle:string;
      controllerNoticeText: string;
      sectionTitle:         string;
      addBtn:               string;
      newTitle:             string;
      fieldControllerName:  string;
      fieldControllerNamePh:string;
      fieldEvidenceRef:     string;
      fieldEvidenceRefPh:   string;
      fieldScope:           string;
      fieldScopePh:         string;
      fieldIssued:          string;
      fieldValidUntil:      string;
      noneYet:              string;
      noneRequired:         string;
      refLabel:             string;  // "Ref: {ref}"
      issuedLabel:          string;  // "Issued: {date}"
      validUntilLabel:      string;  // "Valid until: {date}"
      verifiedByLabel:      string;  // "✓ Verified by {name}"
      pendingVerification:  string;
      removeConfirm:        string;
    };

    datasets: {
      outboundTitle:       string;
      outboundDesc:        string;
      addFromCatalogBtn:   string;
      noOutboundYet:       string;
      noOutboundHint:      string;
      inboundTitle:        string;
      inboundDesc:         string;
      addInboundBtn:       string;
      inboundFormTitle:    string;
      fieldDatasetName:    string;
      fieldDatasetNamePh:  string;
      fieldDescPh:         string;
      addingEllipsis:      string;
      noInboundYet:        string;
      noInboundHint:       string;
      unknownEntity:       string;
      unnamedDataset:      string;
      linkedLabel:         string;  // "Linked: {name}"
      assignBtn:           string;
      notLinkedYet:        string;
      attributesCountLabel:string;  // "{n} attributes"
      removeBtn:           string;
      removeConfirm:       string;
      noAttrsSelected:     string;
      colAttribute:        string;
      colClassification:   string;
      colPi:               string;
      colTreatment:        string;
      colDq:               string;
      unclassifiedBadge:   string;
      classifyLink:        string;
      piLabel:             string;
      notScoredLabel:      string;
      rulesLink:           string;  // "{n} rules"
      hideLink:            string;
      addIssueLink:        string;
      addIssueTitle:       string;
      loadingDqRules:      string;
      notRunLabel:         string;
      editDqIssueTitle:    string;
      addDqIssueTitle:     string;
      dqDimensionPlaceholder: string;
      dqIssuePlaceholder:  string;
      saveChangesBtn:      string;
      saveIssueBtn:        string;
      assignClassLabel:    string;
      selectTermPlaceholder: string;
      addOutboundModalTitle: string;
      searchTablesPh:      string;
      noTablesFound:       string;
      selectAttrsLabel:    string;  // "Select Attributes ({n} selected)"
      selectAllBtn:        string;
      deselectAllBtn:      string;
      noAttrsFound:        string;
      selectTablePrompt:   string;
      addAttrsBtn:         string;  // "Add {n} attributes"
      linkModalTitle:      string;
      searchCatalogPh:     string;
      searchTablePrompt:   string;
      treatment: {
        asIs:          string;
        masked:        string;
        anonymized:    string;
        pseudonymized: string;
        aggregated:    string;
      };
      severity: {
        info:    string;
        warning: string;
        blocker: string;
      };
    };

    status: {
      draft:         string;
      validation:    string;
      ownerReview:   string;
      privacyReview: string;
      dmoReview:     string;
      execApproval:  string;
      approved:      string;
      active:        string;
      suspended:     string;
      terminated:    string;
      expired:       string;
      renewalDraft:  string;
    };
    scope: {
      internal:        string;
      externalGov:     string;
      externalPrivate: string;
    };
    direction: {
      provider:      string;
      requester:     string;
      bidirectional: string;
    };
  };

  // ── Classification ───────────────────────────────────────────────────────────
  classification: {
    pageTitle:              string;
    pageDesc:               string;
    // Stat tiles
    statTotalCols:          string;
    statClassified:         string;
    statNotClassified:      string;
    statCde:                string;
    statCdeSub:             string;
    statPii:                string;
    statPiiSub:             string;
    statAssetTypes:         string;
    piCategoryLabel:        string;
    // Filters & toolbar
    filterAll:              string;
    filterClassified:       string;
    filterUnclassified:     string;
    filterCde:              string;
    searchPlaceholder:      string;
    selectedCount:          string;
    assignClassification:   string;
    clearSelection:         string;
    savingLabel:            string;
    workflowBanner:         string;
    // Table headers
    colColumnTable:         string;
    colDataType:            string;
    colAssetType:           string;
    colClassification:      string;
    colClassificationTerm:  string;
    colCde:                 string;
    colPii:                 string;
    colPiCategory:          string;
    // States
    loadingLabel:           string;
    noColumnsMatch:         string;
    showAll:                string;
    // Asset type values
    assetBusiness:          string;
    assetTechnical:         string;
    // Pagination
    prevPage:               string;
    nextPage:               string;
    // Bulk assign modal
    bulkTitle:              string;
    bulkSubtitle:           string;
    bulkSearchPh:           string;
    bulkWorkflowNote:       string;
    bulkCancel:             string;
    bulkApply:              string;
    // Inline picker
    assignPlaceholder:      string;
    removeClassification:   string;
    noMatch:                string;
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

  // ── AI Metadata Enrichment (descriptions + DQ rule suggestions) ──────────────
  enrichment: {
    suggest:            string;
    suggesting:         string;
    rephrase:           string;
    rephrasing:         string;
    regenerate:         string;
    accept:              string;
    editThenAccept:      string;
    discard:              string;
    aiPendingLabel:       string;   // "AI-suggested — pending steward approval"
    rationaleLabel:       string;
    currentLabel:         string;
    suggestedLabel:       string;
    variantLabel:         string;   // "Variant {n}"
    noDescriptionYet:      string;
    errorPrefix:           string;
    suggestRules:          string;
    suggestingRules:       string;
    ruleDraftsTitle:        string;
    addDraft:                string;
    addDraftWithEdits:       string;
    dismissDraft:            string;
    evidenceLabel:            string;
    duplicateLabel:           string;
    degradedProfileWarning:   string;
    tier2UnavailableWarning:  string;
    reviewQueueTitle:         string;
    reviewQueueSubtitle:      string;
    tabDescriptions:          string;
    tabDqRules:                string;
    bulkAccept:                 string;
    driftWarning:                string;
  };
};
