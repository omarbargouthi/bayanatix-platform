import type { ReportFilters, Page, KpiCardData, TrendPoint } from "../queries/reports";
import {
  getMcmReportData, getDqReportData, getDcReportData, getDsiReportData, getOdReportData,
  getFoiReportData, getPdpReportData, getDgSummaryReportData, getRetReportData,
} from "../queries/reports";

type Row = Record<string, unknown>;
type Column = { key: string; label: string; get: (row: Row) => string | number };
type ReportDataResult = { kpis: KpiCardData[]; drillDown: Row[]; total: number; trend: TrendPoint[]; primaryKpiCode: string | null };

export type ReportDescriptor = {
  code: string;
  label: string;
  fetch: (filters: ReportFilters, page: Page) => Promise<ReportDataResult>;
  drillDownColumns: Column[];
};

const yn = (v: unknown) => (v ? "Yes" : "No");

export const REPORT_REGISTRY: Record<string, ReportDescriptor> = {
  R1_MCM: {
    code: "R1_MCM", label: "Data Catalog / Metadata",
    fetch: getMcmReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "entityName", label: "Table", get: (r) => String(r.entityName) },
      { key: "sourceName", label: "Source", get: (r) => String(r.sourceName) },
      { key: "domainName", label: "Domain", get: (r) => String(r.domainName) },
      { key: "hasOwner", label: "Has Owner", get: (r) => yn(r.hasOwner) },
      { key: "missingDescCount", label: "Missing Descriptions", get: (r) => Number(r.missingDescCount) },
      { key: "unlinkedColumnCount", label: "Unlinked Columns", get: (r) => Number(r.unlinkedColumnCount) },
    ],
  },
  R2_DQ: {
    code: "R2_DQ", label: "Data Quality",
    fetch: getDqReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "ruleName", label: "Rule", get: (r) => String(r.ruleName) },
      { key: "dimensionName", label: "Dimension", get: (r) => String(r.dimensionName) },
      { key: "severity", label: "Severity", get: (r) => String(r.severity) },
      { key: "statusCode", label: "Status", get: (r) => String(r.statusCode) },
      { key: "entityName", label: "Table", get: (r) => String(r.entityName) },
      { key: "sourceName", label: "Source", get: (r) => String(r.sourceName) },
      { key: "ageDays", label: "Age (days)", get: (r) => Number(r.ageDays) },
    ],
  },
  R3_DC: {
    code: "R3_DC", label: "Data Classification",
    fetch: getDcReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "physicalName", label: "Column", get: (r) => String(r.physicalName) },
      { key: "entityName", label: "Table", get: (r) => String(r.entityName) },
      { key: "sourceName", label: "Source", get: (r) => String(r.sourceName) },
      { key: "isPii", label: "PII", get: (r) => yn(r.isPii) },
      { key: "suggestedClassCode", label: "Suggested Type", get: (r) => String(r.suggestedClassCode ?? "—") },
    ],
  },
  R4_DSI: {
    code: "R4_DSI", label: "Data Sharing",
    fetch: getDsiReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "dsaReferenceCode", label: "Reference", get: (r) => String(r.dsaReferenceCode) },
      { key: "titleText", label: "Title", get: (r) => String(r.titleText) },
      { key: "statusCode", label: "Status", get: (r) => String(r.statusCode) },
      { key: "sharingScopeCode", label: "Scope", get: (r) => String(r.sharingScopeCode ?? "—") },
      { key: "counterpartyName", label: "Counterparty", get: (r) => String(r.counterpartyName ?? "—") },
      { key: "effectiveEndDate", label: "Expires", get: (r) => String(r.effectiveEndDate ?? "—") },
    ],
  },
  R5_OD: {
    code: "R5_OD", label: "Open Data",
    fetch: getOdReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "datasetName", label: "Dataset", get: (r) => String(r.datasetName) },
      { key: "statusCode", label: "Status", get: (r) => String(r.statusCode) },
      { key: "categoryName", label: "Category", get: (r) => String(r.categoryName ?? "—") },
      { key: "publishDate", label: "Published", get: (r) => String(r.publishDate ?? "—") },
    ],
  },
  R6_FOI: {
    code: "R6_FOI", label: "FOI",
    fetch: getFoiReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "referenceCode", label: "Reference", get: (r) => String(r.referenceCode) },
      { key: "subjectText", label: "Subject", get: (r) => String(r.subjectText) },
      { key: "statusCode", label: "Status", get: (r) => String(r.statusCode) },
      { key: "officerName", label: "Officer", get: (r) => String(r.officerName ?? "Unassigned") },
      { key: "firstResponseDueDate", label: "Due", get: (r) => String(r.firstResponseDueDate ?? "—") },
    ],
  },
  R7_PDP: {
    code: "R7_PDP", label: "Personal Data Protection",
    fetch: getPdpReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "physicalName", label: "Column", get: (r) => String(r.physicalName) },
      { key: "entityName", label: "Table", get: (r) => String(r.entityName) },
      { key: "piCategoryName", label: "PI Category", get: (r) => String(r.piCategoryName ?? "—") },
      { key: "isClassified", label: "Classified", get: (r) => yn(r.isClassified) },
      { key: "hasOwner", label: "Table Owner", get: (r) => yn(r.hasOwner) },
    ],
  },
  R8_DG_SUMMARY: {
    code: "R8_DG_SUMMARY", label: "DG Executive Summary",
    fetch: getDgSummaryReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "entityName", label: "Table", get: (r) => String(r.entityName) },
      { key: "sourceName", label: "Source", get: (r) => String(r.sourceName) },
      { key: "hasOwner", label: "Has Owner", get: (r) => yn(r.hasOwner) },
      { key: "hasSteward", label: "Has Steward", get: (r) => yn(r.hasSteward) },
      { key: "isCertified", label: "Certified", get: (r) => yn(r.isCertified) },
      { key: "missingDescCount", label: "Columns Missing Description", get: (r) => Number(r.missingDescCount) },
    ],
  },
  R9_RETENTION: {
    code: "R9_RETENTION", label: "Retention",
    fetch: getRetReportData as ReportDescriptor["fetch"],
    drillDownColumns: [
      { key: "entityName", label: "Table", get: (r) => String(r.entityName) },
      { key: "sourceName", label: "Source", get: (r) => String(r.sourceName) },
      { key: "categoryName", label: "Category", get: (r) => String(r.categoryName ?? "—") },
      { key: "effectiveExpiryDate", label: "Expired On", get: (r) => String(r.effectiveExpiryDate ?? "—") },
      { key: "postRetentionAction", label: "Action", get: (r) => String(r.postRetentionAction ?? "Unscheduled") },
    ],
  },
};
