// Approval routing rules for Data Sharing Agreements.
// Returns the ordered list of approval stations required for a given DSA.
//
// Lightweight path: INTERNAL scope + max classification rank < CONFIDENTIAL (rank < 3)
//   → Owner only.
// Full path: Owner → Privacy (if PI) → DMO → Exec (if SECRET/TOP_SECRET)

export type ApprovalStation = {
  stationCode:  "DATA_OWNER" | "DATA_PRIVACY" | "DMO_REVIEW" | "EXEC_DELEGATE";
  stationOrder: number;
  required:     boolean;
};

const CLASS_RANK: Record<string, number> = {
  PUBLIC:       1,
  INTERNAL:     2,
  CONFIDENTIAL: 3,
  RESTRICTED:   3,
  SECRET:       4,
  TOP_SECRET:   5,
};

export function computeApprovalStations(opts: {
  sharingScopeCode:           string;
  maxClassificationCode:      string | null;
  containsPersonalData:       boolean;
}): ApprovalStation[] {
  const { sharingScopeCode, maxClassificationCode, containsPersonalData } = opts;
  const rank = CLASS_RANK[maxClassificationCode ?? "PUBLIC"] ?? 1;

  // Lightweight path: INTERNAL + below CONFIDENTIAL
  if (sharingScopeCode === "INTERNAL" && rank < 3) {
    return [{ stationCode: "DATA_OWNER", stationOrder: 1, required: true }];
  }

  const stations: ApprovalStation[] = [
    { stationCode: "DATA_OWNER",  stationOrder: 1, required: true },
    { stationCode: "DATA_PRIVACY",stationOrder: 2, required: containsPersonalData },
    { stationCode: "DMO_REVIEW",  stationOrder: 3, required: true },
    { stationCode: "EXEC_DELEGATE",stationOrder: 4, required: rank >= 4 }, // SECRET / TOP_SECRET
  ];

  return stations;
}

export function nextStatusAfterApproval(
  currentStatus: string,
  decisionCode: "APPROVED" | "REJECTED" | "RETURNED",
  stationCode: string,
  allApprovals: { stationCode: string; decisionCode: string; requiredIndicator: boolean }[],
): string {
  if (decisionCode === "REJECTED" || decisionCode === "RETURNED") return "DRAFT";

  const required = allApprovals.filter(a => a.requiredIndicator);
  const allDone  = required.every(a => a.decisionCode === "APPROVED" || !a.requiredIndicator);

  if (allDone) return "APPROVED";

  switch (stationCode) {
    case "DATA_OWNER":  {
      const needsPrivacy = allApprovals.some(a => a.stationCode === "DATA_PRIVACY" && a.requiredIndicator);
      return needsPrivacy ? "PRIVACY_REVIEW" : "DMO_REVIEW";
    }
    case "DATA_PRIVACY": return "DMO_REVIEW";
    case "DMO_REVIEW": {
      const needsExec = allApprovals.some(a => a.stationCode === "EXEC_DELEGATE" && a.requiredIndicator);
      return needsExec ? "EXEC_APPROVAL" : "APPROVED";
    }
    case "EXEC_DELEGATE": return "APPROVED";
    default: return currentStatus;
  }
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT:          "Draft",
  VALIDATION:     "Validation",
  OWNER_REVIEW:   "Owner Review",
  PRIVACY_REVIEW: "Privacy Review",
  DMO_REVIEW:     "DMO Review",
  EXEC_APPROVAL:  "Exec Approval",
  APPROVED:       "Approved",
  ACTIVE:         "Active",
  SUSPENDED:      "Suspended",
  TERMINATED:     "Terminated",
  EXPIRED:        "Expired",
  RENEWAL_DRAFT:  "Renewal Draft",
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT:          "bg-gray-100 text-gray-600",
  VALIDATION:     "bg-amber-100 text-amber-700",
  OWNER_REVIEW:   "bg-blue-100 text-blue-700",
  PRIVACY_REVIEW: "bg-purple-100 text-purple-700",
  DMO_REVIEW:     "bg-indigo-100 text-indigo-700",
  EXEC_APPROVAL:  "bg-orange-100 text-orange-700",
  APPROVED:       "bg-green-100 text-green-700",
  ACTIVE:         "bg-green-600 text-white",
  SUSPENDED:      "bg-red-100 text-red-700",
  TERMINATED:     "bg-red-200 text-red-800",
  EXPIRED:        "bg-gray-200 text-gray-500",
  RENEWAL_DRAFT:  "bg-sky-100 text-sky-700",
};

export const SCOPE_LABELS: Record<string, string> = {
  INTERNAL:         "Internal",
  EXTERNAL_GOV:     "External – Government",
  EXTERNAL_PRIVATE: "External – Private",
};

export const DIRECTION_LABELS: Record<string, string> = {
  PROVIDER:      "Provider",
  REQUESTER:     "Requester",
  BIDIRECTIONAL: "Bidirectional",
};
