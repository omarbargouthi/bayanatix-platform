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
    bulkOperations:   string;
    privacy:          string;
    sharing:          string;
    openData:         string;
    foi:              string;
    customAssets:     string;
    // Admin section items
    userManagement:   string;
    workflows:        string;
    dataSources:      string;
    auditLogs:        string;
    configuration:       string;
    aiProviders:         string;
    maturityIndexSetup:  string;
    reportsKpi:          string;
    customAssetTypes:    string;
    // Compliance sub-items (kept for backward compat)
    complianceConfig: string;
    indexSetup:       string;
    // Section group headers
    sectionDomains:    string;
    sectionAdmin:      string;
    sectionCompliance: string;
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
    remove:      string;
    submitting:  string;
    submit:      string;
    // Relative time (used by activity/history timelines)
    justNow:     string;
    minutesAgo:  string;   // "{n}m ago"
    hoursAgo:    string;   // "{n}h ago"
    yesterday:   string;
    daysAgo:     string;   // "{n}d ago"
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
      formSourceUrl:  string;
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
      wfRejected:       string;
      rejectAction:     string;
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
    cdesCoverage:     string;
    cdesCovered:      string;
    dataClassification: string;
    columnsClassifiedLabel: string;
    metadataQuality:  string;
    dataQuality:      string;
    score:            string;
    completeness:     string;
    accuracy:         string;
    consistency:      string;
    timeliness:       string;
    validity:         string;
    uniqueness:       string;
    noCdesYet:        string;
    configureBtn:     string;
    dqConfigTitle:    string;
    dqConfigDesc:     string;
    dqWeight:         string;
    dqIncluded:       string;
    noRulesYet:       string;
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
    linkedTerms:      string;
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
    colEditDescPlaceholder:    string;
    colEditNoSourceComment:    string;
    colEditFriendlyPlaceholder: string;
    colEditNoneOption:         string;
    colEditBusinessOption:     string;
    colEditTechnicalOption:    string;
    colEditUnknownErr:         string;
    colEditSaveFailed:         string;
    colEditTooltip:            string;
    // ColumnsTable.tsx — grid headers & column chooser
    colHeaderColumn:           string;
    colHeaderDataType:         string;
    colHeaderNullPct:          string;
    colHeaderClassification:   string;
    colHeaderCde:              string;
    colHeaderClassTerm:        string;
    colHeaderContextEnrichment:string;
    colHeaderGlossaryTerm:     string;
    colHeaderQuality:          string;
    colHeaderFriendlyName:     string;
    colHeaderColumnType:       string;
    colHeaderEncrypted:        string;
    colHeaderPii:              string;
    colHeaderPiCategory:       string;
    columnsChooserBtn:         string;
    visibleColumnsTitle:       string;
    resetBtn:                  string;
    // ColumnsTable.tsx — expanded column detail panel
    colDetailDescription:      string;
    colDetailNoDescription:    string;
    colDetailNoClassTerm:      string;
    colDetailTermWord:         string;
    colDetailCdeYes:           string;
    colDetailBusinessTermsEnrichment: string;
    colDetailNoneLinked:       string;
    colDetailTagsWord:         string;
    colDetailNoTags:           string;
    colDetailHideRelationships: string;
    colDetailViewRelationships: string;
    colDetailEditColumnBtn:    string;
    // Table detail page — DQ summary panel & schema-tab tags
    viewBadge:              string;
    tableBadge:             string;
    rowsWord:               string;
    schemaLabelPrefix:      string;
    lastRefreshedLabel:     string;
    lastRefreshedPlaceholderValue: string;
    openQuestionsBadge:     string;   // "{n} open question(s)"
    rulesManageLink:        string;   // "{n} rule(s) → manage"
    dqNotRunYet:            string;
    dqNoRulesAssigned:      string;
    freshness:              string;
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
    tableHealth:               string;
    overallCdes:               string;
    metadataCompletion:        string;
    columnTypeClassification:  string;
    overallQualityScore:       string;
    noRulesScored:             string;
    // TablePageActions.tsx
    requestAccessBtn:      string;
    suggestingBtn:         string;
    suggestColumnTypesBtn: string;
    suggestTermBtn:        string;
    exportImportBtn:       string;
    certifyTableTooltip:   string;
    changeHistoryTooltip:  string;
    collabThreadsTooltip:  string;
    discussionTitlePrefix: string;   // "Discussion: {name}"
    columnsEvaluatedSummary: string; // "{count} column(s) evaluated, {changed} suggestion(s) changed"
    classificationFailed:  string;
    // CertifyAssetModal.tsx
    certifyAssetTitle:        string;
    certifyAssetDesc:         string;
    metadataCertificationTitle: string;
    metadataCertificationDesc:  string;
    dataCertificationTitle:     string;
    dataCertificationDesc:      string;
    removeCertConfirm:        string;  // "Remove {title} certification?"
    certifiedSuffix:          string;
    notYetCertified:          string;
    certNotesLabel:           string;
    certNotesOptional:        string;
    certNotesPlaceholder:     string;
    certSaveFailed:           string;
    doneBtn:                  string;
    levelGold:                string;
    levelSilver:              string;
    levelBronze:              string;
    // AssetHistoryDrawer.tsx
    changeHistoryTitle:   string;
    noChangesYet:         string;
    noFieldDetails:       string;
    historyLoadFailed:    string;
    fieldDescription:        string;
    fieldFriendlyName:       string;
    fieldEncrypted:          string;
    fieldColumnType:         string;
    fieldBusinessTerm:       string;
    fieldTableType:          string;
    fieldDefinition:         string;
    fieldFormat:             string;
    fieldBusinessRules:      string;
    fieldClassification:     string;
    fieldPiiFlag:            string;
    fieldPiCategory:         string;
    fieldExample:            string;
    fieldTermType:           string;
    fieldBusinessApplication:string;
    fieldSchemaName:         string;
    fieldSourceName:         string;
    // RaiseRequestModal.tsx (also used by AssetRequestsDrawer)
    raiseRequestTitle:     string;
    requestTypeLabel:      string;
    reqTypeFixDataIssue:      string;
    reqTypeFixDataIssueDesc:  string;
    reqTypeUpdateDefinition:     string;
    reqTypeUpdateDefinitionDesc: string;
    reqTypeCertifyAsset:      string;
    reqTypeCertifyAssetDesc:  string;
    reqTypeGrantAccess:       string;
    reqTypeGrantAccessDesc:   string;
    reqTypeRemoveAccess:      string;
    reqTypeRemoveAccessDesc:  string;
    reqTypeOther:             string;
    reqTypeOtherDesc:         string;
    priorityLabel:      string;
    priorityHigh:       string;
    priorityHighDesc:   string;
    priorityMedium:     string;
    priorityMediumDesc: string;
    priorityLow:        string;
    priorityLowDesc:    string;
    titleLabel:            string;
    titlePlaceholder:      string;
    detailsLabel:          string;
    detailsOptional:       string;
    detailsPlaceholder:    string;
    targetAssetsLabel:     string;
    addAnotherTable:       string;
    selectRequestTypeErr:  string;
    enterTitleErr:         string;
    targetRequiredErr:     string;
    submitRequestFailed:   string;
    unknownErr:            string;
    submitRequestBtn:      string;
    // AssetRequestsDrawer.tsx
    assetRequestsTitle:  string;
    newRequestBtn:       string;
    noOpenRequests:      string;
    raiseARequestBtn:    string;
    openCountLabel:      string;   // "Open · {n}"
    resolvedCountLabel:  string;   // "Resolved · {n}"
    alsoTargets:         string;
    resolutionNotesLabel: string;
    updateStatusLabel:    string;
    statusOpen:        string;
    statusInProgress:  string;
    statusResolved:    string;
    statusClosed:      string;
    priorityTooltip:   string;   // "{priority} priority"
    // RequestPiAccessModal.tsx
    piAccessTitle:           string;
    piAccessDesc:            string;
    purposeLabel:            string;
    purposePlaceholder:      string;
    legalBasisLabel:         string;
    legalBasisPlaceholder:   string;
    purposeRequiredErr:      string;
    legalBasisRequiredErr:   string;
    piAccessSubmitFailed:    string;
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
    colSit:             string;
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
    pageTitle:          string;
    pageDesc:           string;
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
      source:        string;
      raw:           string;
      staging:       string;
      table:         string;
      view:          string;
      lakehouse:     string;
      semanticModel: string;
      report:        string;
    };
    engines: {
      oracle:   string;
      mssql:    string;
      postgres: string;
      powerbi:  string;
      fabric:   string;
    };
    groupBySystem: string;
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
    // PbixUploadButton.tsx
    uploadPbixBtn:          string;
    uploadPbixDesc:         string;
    attachConnectionLabel:  string;
    noConnectionsOption:    string;
    parsingBtn:             string;
    uploadBuildBtn:         string;
    loadConnectionsFailed:  string;
    uploadFailedErr:        string;
    edgesCreatedSummary:    string;  // "{n} lineage edge(s) created"
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

  // ── Homepage (personalized widget board) ──────────────────────────────────
  homepage: {
    pageTitle:        string;
    pageDesc:         string;
    customize:        string;
    doneCustomizing:  string;
    addWidget:        string;
    addWidgetTitle:   string;
    removeWidget:     string;
    noWidgets:        string;
    noWidgetsHint:    string;
    allAdded:         string;
    widgetTitles: {
      needsAction:    string;
      myRequests:     string;
      stewardDomains: string;
      quickLinks:     string;
      savedSearches:  string;
      recentAssets:   string;
      followedActivity: string;
    };
    followedActivity: {
      empty: string;
    };
    needsAction: {
      empty: string;
    };
    myRequests: {
      openCount:  string; // supports {n}
      raisedByMe: string;
      onMyAsset:  string;
      empty:      string;
      viewAll:    string;
    };
    stewardDomains: {
      openRequests: string; // supports {n}
      empty:        string;
    };
    quickLinks: {
      catalog:        string;
      classification: string;
      reports:        string;
      requests:       string;
      admin:          string;
    };
    savedSearches: {
      empty: string;
    };
    recentAssets: {
      empty: string;
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
    tabDescriptionsAndDq:      string;
    tabColumnTypes:            string;
    tabTableTypes:             string;
    tabSitTypes:               string;
    bulkAccept:                 string;
    driftWarning:                string;
    langLabel:                   string;
    langAuto:                     string;
    langEnglish:                  string;
    langArabic:                   string;
  };

  // ── Reports (KPI engine: index, 9 capability reports, Domain Scorecard) ──────
  reports: {
    index: {
      title:              string;
      subtitle:           string;
      scorecardsTitle:    string;
      scorecardsSubtitle: string;
      noDomains:          string;
    };
    common: {
      captureSnapshot:     string;
      capturing:           string;
      exportXlsx:          string;
      exportPdf:           string;
      trend:               string;
      noTrend:             string;
      noTrendSub:          string;
      prev:                string;
      next:                string;
      page:                string;   // "Page"
      of:                  string;   // "of"
      target:              string;
      higherBetter:        string;
      lowerBetter:         string;
      allDomains:          string;
      allSources:          string;
      allOwners:           string;
      periodCurrentMonth:  string;
      domainLockedHint:    string;
      yes:                 string;
      no:                  string;
      colTable:            string;
      colSource:           string;
      colDomain:           string;
      colStatus:           string;
      colOwner:            string;
      colSteward:          string;
      colCertified:        string;
      colCategory:         string;
    };
    mcm: {
      title:          string;
      subtitle:       string;
      drillTitle:     string;
      empty:          string;
      colMissingDesc: string;
      colUnlinked:    string;
    };
    dq: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colRule:      string;
      colDimension: string;
      colSeverity:  string;
      colAge:       string;
    };
    dc: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colColumn:     string;
      colPii:        string;
      colSuggested:  string;
      colConfidence: string;
    };
    dsi: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colRef:          string;
      colTitle:        string;
      colScope:        string;
      colCounterparty: string;
      colExpires:      string;
    };
    od: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colDataset:   string;
      colPublished: string;
      colRaisedBy:  string;
    };
    foi: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colRef:            string;
      colSubject:        string;
      colOfficer:        string;
      colDue:            string;
      colClosed:         string;
      unassigned:        string;
      openTasksByType:   string;
      viewAllRequests:   string;
    };
    pdp: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colColumn:      string;
      colPiCategory:  string;
      colClassified:  string;
    };
    dg: {
      title:      string;
      subtitle:   string;
      drillTitle: string;
      empty:      string;
      colMissingDesc: string;
    };
    retention: {
      title:      string;
      subtitle:   string;
      note:       string;
      drillTitle: string;
      empty:      string;
      colExpired:     string;
      colAction:      string;
      unscheduled:    string;
    };
    domain: {
      capabilityScores: string;
      topIssues:        string;
      noIssues:         string;
      ownerStewards:    string;
      domainOwner:      string;
      unassigned:       string;
      noStewards:       string;
      exportBrief:      string;
    };
  };

  // ── AI Chat Assistant ("Ask Bayanatix") ──────────────────────────────────────
  // UI chrome only — the assistant's own reply language follows the question's
  // language via a system-prompt instruction, independent of this UI setting.
  chat: {
    headerTitle:        string;
    headerSubtitle:     string;
    placeholder:        string;
    greeting:           string;
    newChat:            string;
    history:            string;
    send:               string;
    unavailable:        string;
    sources:            string;
    thumbsUp:           string;
    thumbsDown:         string;
    feedbackComment:    string;
    deleteConversation: string;
    noConversations:    string;
  };

  // ── Freedom of Information (FOI) case management ────────────────────────────
  foi: {
    // Shared case-status labels — FoiQueue rows, CaseFile header
    status: {
      SUBMITTED:               string;
      TRIAGE:                  string;
      CLARIFICATION_REQUESTED: string;
      ASSESSMENT:              string;
      QUOTED:                  string;
      QUOTE_ACCEPTED:          string;
      IN_FULFILLMENT:          string;
      AWAITING_PAYMENT:        string;
      DELIVERED:               string;
      CLOSED:                  string;
      REJECTED:                string;
      APPEAL_OPEN:             string;
      APPEAL_DECIDED:          string;
      QUOTE_DECLINED:          string;
      WITHDRAWN:               string;
    };
    // Officer queue (FoiQueue.tsx)
    queue: {
      pageTitle:        string;
      pageDesc:         string;
      publicIntakeLink: string;
      registerRequest:  string;
      statTotal:        string;
      statActive:       string;
      statOverdue:      string;
      statAwaitingAction: string;
      filterActive:     string;
      filterAll:        string;
      searchPlaceholder:string;
      colReference:     string;
      colSubject:       string;
      colOfficer:       string;
      colSubmitted:     string;
      colSla:           string;
      colStatus:        string;
      colChannel:       string;
      unassigned:       string;
      noResults:        string;
      allClear:         string;
      slaOverdue:       string;   // "Overdue {n}d"
      slaLeft:          string;   // "{n}d left"
      totalCount:       string;   // "{n} total"
      prev:             string;
      next:             string;
      page:             string;   // "Page {n}"
    };
    // Case file shell (CaseFile.tsx)
    caseFile: {
      loadingCase:    string;
      notFound:       string;
      tabRequest:     string;
      tabAssessment:  string;
      tabFulfillment: string;
      tabPayments:    string;
      tabCommunications: string;
      deleteRequest:  string;
      deleteConfirm:  string;   // "Delete {ref}?"
      confirm:        string;
      cancel:         string;
      slaRemaining:   string;
      overdue:        string;
    };
    // Request tab (RequestTab.tsx)
    request: {
      requesterInfo:   string;
      typeLabel:       string;
      nameLabel:       string;
      emailLabel:      string;
      phoneLabel:      string;
      idCrLabel:       string;
      languageLabel:   string;
      requestDetails:  string;
      referenceLabel:  string;
      channelLabel:    string;
      domainLabel:     string;
      formatLabel:     string;
      submittedLabel:  string;
      slaDueLabel:     string;
      assignedToLabel: string;
      subjectLabel:    string;
      descriptionLabel:string;
      rejectionTitle:  string;
      groundLabel:     string;
      justificationLabel: string;
      deliveredTitle:  string;
      deliveryRefLabel:string;
      triageActions:   string;
      proceedToAssessment: string;
      requestClarification: string;
      alreadyPublicAction:  string;
      rejectAction:    string;
      resumeFromClarification: string;
      moveToAssessmentDesc: string;
      moving:          string;
      cancelBtn:       string;
      messageToRequester: string;
      clarifyPlaceholder: string;
      sending:         string;
      sendAndPauseSla: string;
      publicLinkRef:   string;
      publicLinkPlaceholder: string;
      answerAndClose:  string;
      protectionGround: string;
      selectGround:    string;
      justificationPlaceholder: string;
      rejecting:       string;
      rejectRequestBtn: string;
      networkErrorRetry: string;
      actionFailed:    string;
    };
    // Assessment & Quote tab (AssessmentTab.tsx)
    assessment: {
      eligibleLabel:      string;
      alreadyPublicLabel: string;
      partialLabel:       string;
      protectedLabel:     string;
      simpleLabel:        string;
      mediumLabel:        string;
      complexLabel:       string;
      requestedAttrs:     string;
      requestedAttrsDesc: string;
      noStructuredAttrs:  string;
      assessmentTitle:    string;
      assessedBadge:      string;
      notAssessableYet:   string;
      eligibilityLabel:   string;
      complexityLabel:    string;
      publicLinkLabel:    string;
      exemptionAppliedTitle: string;
      costCalculatorTitle:   string;
      autoSuggestDays:    string;
      columnsCount:       string;
      sourcesCount:       string;
      effortDaysLabel:    string;
      exemptZeroCost:     string;
      exemptZeroCostDesc: string;
      daysAtRate:         string;   // "{days} days"
      perDay:             string;   // "× SAR {rate} / day"
      assessmentNotes:    string;
      assessmentNotesPlaceholder: string;
      grantExemption:     string;
      exemptionReasonLabel: string;
      exemptionReasonPlaceholder: string;
      exemptionEvidenceLabel: string;
      exemptionEvidencePlaceholder: string;
      exemptionOwnerNote: string;
      exemptionApproved:  string;
      exemptionRejected:  string;
      saving:             string;
      updateAssessment:   string;
      saveAssessment:     string;
      quoteTitle:         string;
      exemptBannerTitle:  string;
      exemptBannerDesc:   string;
      exemptReasonPrefix: string;
      quotedAmountLabel:  string;
      freeLabel:          string;
      manuallyAdjusted:   string;
      dailyRateLabel:     string;
      deliveryEstLabel:   string;
      workingDaysSuffix:  string;
      manualAdjustmentTitle: string;
      justificationPrefix:  string;
      pendingOwnerReview: string;
      approve:            string;
      rejectBtn:          string;
      adjustmentApproved: string;
      adjustmentRejected: string;
      recordDecisionPrompt: string;
      accepted:           string;
      declined:           string;
      paymentRequiredPrefix: string;
      paymentRequiredSuffix: string;
      receivedSoFar:      string;
      recordPaymentsHint: string;
      paymentsTabName:    string;
      startFulfillment:   string;
      noChargeQuoteTitle: string;
      noChargeQuoteDesc:  string;
      computedAmount:     string;
      overrideAmount:     string;
      overrideAmountLabel:string;
      justificationLabel: string;
      overrideJustificationPlaceholder: string;
      overrideOwnerNote:  string;
      estDeliveryDaysLabel: string;
      noteOptionalLabel:  string;
      noteOptionalPlaceholder: string;
      finalAmount:        string;
      finalAmountExempt:  string;
      issuing:            string;
      issueQuote:         string;
      saveAssessmentHint: string;
    };
    // Fulfillment tab (FulfillmentTab.tsx)
    fulfillment: {
      stage: {
        ownerIdName: string; ownerIdRole: string; ownerIdDesc: string;
        sourceMapName: string; sourceMapRole: string; sourceMapDesc: string;
        classGateName: string; classGateRole: string; classGateDesc: string;
        qualityGateName: string; qualityGateRole: string; qualityGateDesc: string;
        techCompName: string; techCompRole: string; techCompDesc: string;
        ownerApprovalName: string; ownerApprovalRole: string; ownerApprovalDesc: string;
        dmoApprovalName: string; dmoApprovalRole: string; dmoApprovalDesc: string;
        deliveryName: string; deliveryRole: string; deliveryDesc: string;
      };
      sensPublic: string; sensInternal: string; sensConfidential: string;
      sensRestricted: string; sensSecret: string; sensTopSecret: string;
      notStartedYet:     string;
      stagesTitle:       string;
      currentBadge:      string;
      viewLinkedDataset:  string;
      sourceMappingTitle: string;
      mappedCount:        string;
      sourceMappingDesc:  string;
      noStructuredAttrs:  string;
      catalogPrefix:      string;
      unclassifiedInCatalog: string;
      needsFoiSensitivity:   string;
      stewardNotified:       string;
      hideThread:            string;
      threadCount:           string;
      notMapped:             string;
      edit:                  string;
      mapBtn:                string;
      classificationDiscussion: string;
      markAsClassified:      string;
      collapse:              string;
      expand:                string;
      setSensitivityTitle:   string;
      catalogCodeHint:       string;
      selectStewardConfirmedHint: string;
      selectSensitivityPlaceholder: string;
      blockAtGateWarning:    string;
      confirmClassification: string;
      addNotePlaceholder:    string;
      notesOptionalPlaceholder: string;
      send:                  string;
      cmdEnterHint:          string;
      fromCatalog:           string;
      manualEntry:           string;
      sourceSystemLabel:     string;
      selectPlaceholder:     string;
      tableEntityLabel:      string;
      columnAttributeLabel:  string;
      unclassifiedOption:    string;
      classFromCatalog:      string;
      autoFilledBelow:       string;
      catalogCodePrefix:     string;
      catalogCodeNonStandardDesc: string;
      notClassifiedWarning:  string;
      notClassifiedDesc:     string;
      systemAppLabel:        string;
      tableReportLabel:      string;
      columnFieldLabel:      string;
      sensitivityLabel:      string;
      autoFilledOrThread:    string;
      pendingClassification: string;
      blockDisclosureWarning: string;
      officerNotesLabel:     string;
      officerNotesPlaceholder: string;
      saveMapping:           string;
      pendingClassificationBanner: string;
      mapAllBeforeProceeding: string;
      runClassificationCheck: string;
      classificationGateTitle: string;
      columnsBlocked:        string;
      returnToSourceMapping: string;
      mappingsPending:       string;
      stewardNotYetNotified: string;
      allColumnsCleared:     string;
      proceedToQualityGate:  string;
      qualityGateTitle:      string;
      runDqCheck:            string;
      running:               string;
      qualityGateDesc:       string;
      manualPrefix:          string;
      manualNoIndicator:     string;
      noDqIndicator:         string;
      rulesDefinedNotRun:    string;
      dqPassed:              string;
      dqIssuesDetected:      string;
      checkedAt:             string;
      noDqIndicatorBadge:    string;
      notRunBadge:           string;
      dqPassedBadge:         string;
      dqIssuesBadge:         string;
      reviewBadge:           string;
      columnsFlagged:        string;
      deliveryTypeQuestion:  string;
      publishOpenData:       string;
      publishOpenDataDesc:   string;
      oneOffDelivery:        string;
      oneOffDeliveryDesc:    string;
      selectedBadge:         string;
      datasetNameLabel:      string;
      datasetNameHint:       string;
      datasetDescLabel:      string;
      datasetDescHint:       string;
      datasetDescPlaceholder: string;
      createRecordAdvance:   string;
      createDatasetAdvance:  string;
      oneOffCreatedTitle:    string;
      oneOffCreatedDesc:     string;
      openDataCreatedTitle:  string;
      openDataCreatedDesc:   string;
      datasetNotProcessedTitle: string;
      datasetNotProcessedDesc:  string;
      markStageComplete:     string;
      deliverToRequester:    string;
      linkedDatasetNote:     string;
      deliveryRefLabel:      string;
      deliveryRefPlaceholder: string;
      deliveryMessageLabel:  string;
      deliveryMessagePlaceholder: string;
      confirmDelivery:       string;
      caseDeliveredTitle:    string;
      oneOffBadge:           string;
      openDataBadge:         string;
      deliveryReferenceLabel: string;
      viewOneOffRecord:      string;
      viewOpenDataDataset:   string;
    };
    // Communications tab (CommunicationsTab.tsx)
    communications: {
      typeAck: string; typeClarification: string; typeQuote: string; typeStatusUpdate: string;
      typeRejection: string; typeAppealDecision: string; typeDelivery: string; typeNote: string;
      addCommunication: string;
      newEntryTitle:    string;
      directionLabel:   string;
      directionOutbound:string;
      directionInbound: string;
      typeLabel:        string;
      channelLabel:     string;
      channelEmail:     string;
      channelPortal:    string;
      channelSms:       string;
      channelInPerson:  string;
      subjectLabel:     string;
      subjectPlaceholder: string;
      messageLabel:     string;
      messagePlaceholder: string;
      cancel:           string;
      saving:           string;
      addEntry:         string;
      noneLoggedYet:    string;
      inboundBadge:     string;
      outboundBadge:    string;
      byPrefix:         string;
    };
    // Payments tab (PaymentsTab.tsx)
    payments: {
      typeFulfillmentFee: string;
      typeAppealReviewFee: string;
      typeRefund:          string;
      summaryTitle:        string;
      quotedLabel:         string;
      receivedLabel:       string;
      balanceLabel:        string;
      paidInFull:          string;
      recordPayment:       string;
      recordPaymentTitle:  string;
      amountLabel:         string;
      typeLabel:           string;
      referenceLabel:      string;
      referencePlaceholder:string;
      notesLabel:          string;
      notesPlaceholder:    string;
      cancel:              string;
      recording:           string;
      colType:             string;
      colAmount:           string;
      colReference:        string;
      colNotes:            string;
      colReceived:         string;
      noneRecordedYet:     string;
      enterValidAmount:    string;
    };
    // Public citizen-facing pages (app/foi-request/**) — no session, own LangProvider
    public: {
      intake: {
        pageTitle:      string;
        pageDesc:       string;
        individualType: string;
        organizationType: string;
        orgNameLabel:   string;
        fullNameLabel:  string;
        crNumberLabel:  string;
        nationalIdLabel:string;
        optionalSuffix: string;
        emailLabel:     string;
        phoneLabel:     string;
        preferredLangLabel: string;
        preferredFormatLabel: string;
        subjectLabel:   string;
        subjectPlaceholder: string;
        descriptionLabel: string;
        descriptionPlaceholder: string;
        attrsTitle:     string;
        attrsDesc:      string;
        attrNameLabel:  string;
        attrNamePlaceholder: string;
        attrDescLabel:  string;
        attrDescPlaceholder: string;
        attrFormatLabel:string;
        selectFormatPlaceholder: string;
        remove:         string;
        addAnotherAttr: string;
        submitting:     string;
        submitRequest:  string;
        legalNote:      string;
        successTitle:   string;
        successDesc:    string;
        referenceLabel: string;
        trackLabel:     string;
        importantNote:  string;
        submitAnother:  string;
        fullNameRequired: string;
        emailRequired:    string;
        subjectRequired:  string;
        descriptionRequired: string;
        atLeastOneAttr:   string;
        submissionFailed: string;
        networkError:     string;
        formatNumber: string; formatText: string; formatDate: string; formatSarAmount: string;
        formatPercentage: string; formatYesNo: string; formatFile: string; formatOther: string;
      };
      track: {
        pageTitle:       string;
        loading:         string;
        notFoundTitle:   string;
        notFoundDesc:    string;
        submitNewRequest:string;
        progressSubmitted: string;
        progressDelivered: string;
        firstResponseDue: string;
        quoteTitle:      string;
        totalCostLabel:  string;
        estDeliveryLabel:string;
        workingDaysSuffix: string;
        validUntil:      string;
        validUntilFallback: string;
        acceptQuote:     string;
        declineQuote:    string;
        acceptedNote:    string;
        declinedNote:    string;
        rejectedTitle:   string;
        groundLabel:     string;
        justificationLabel: string;
        appealNote:      string;
        deliveredTitle:  string;
        deliveryRefLabel:string;
        saveUrlNote:     string;
        statusSubmitted:      string; statusSubmittedDesc:      string;
        statusTriage:         string; statusTriageDesc:         string;
        statusClarification:  string; statusClarificationDesc:  string;
        statusAssessment:     string; statusAssessmentDesc:     string;
        statusQuoted:         string; statusQuotedDesc:         string;
        statusQuoteAccepted:  string; statusQuoteAcceptedDesc:  string;
        statusInFulfillment:  string; statusInFulfillmentDesc:  string;
        statusAwaitingPayment:string; statusAwaitingPaymentDesc:string;
        statusDelivered:      string; statusDeliveredDesc:      string;
        statusRejected:       string; statusRejectedDesc:       string;
        statusQuoteDeclined:  string; statusQuoteDeclinedDesc:  string;
        statusWithdrawn:      string; statusWithdrawnDesc:      string;
        statusAppealOpen:     string; statusAppealOpenDesc:     string;
        statusAppealDecided:  string; statusAppealDecidedDesc:  string;
        statusClosed:         string; statusClosedDesc:         string;
      };
    };
  };
};
