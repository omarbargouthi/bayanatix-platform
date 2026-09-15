"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Header, type Crumb } from "./Header";
import type { SessionUser } from "@/lib/types";

// /admin/user-management is a single route whose ?tab= query param switches
// between four sub-sections client-side (see SUB_TABS in that page) — the
// pathname alone can't tell them apart, so mirror that tab list here to keep
// the breadcrumb's last segment in sync with what's actually showing.
const USER_MGMT_TABS: Record<string, string> = {
  users: "Users",
  roles: "Roles",
  teams: "Teams",
  tags:  "Tags",
};

// Top-level admin section labels, keyed by the first path segment after /admin/.
const SECTION_LABELS: Record<string, string> = {
  "user-management":        "User Management",
  "users":                  "Users",
  "roles":                  "Roles",
  "teams":                  "Teams",
  "tags":                   "Tags",
  "sources":                "Data Sources",
  "configuration":          "Configuration",
  "workflows":              "Workflows",
  "audit-log":              "Audit Log",
  "audit-logs":             "Audit Logs",
  "custom-assets":          "Custom Assets",
  "data-quality":           "Data Quality",
  "languages":              "Languages",
  "maturity-index-setup":   "Maturity Index Setup",
  "reports-kpi":            "Reports & KPIs",
  "ai-providers":           "AI Providers",
};

function titleize(segment: string): string {
  return segment.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

// Detail pages (roles/[id], teams/[id], users/[id]) don't have their own name
// available from the path alone — look it up from the existing admin list
// endpoints (small demo datasets, same pattern the list pages themselves use)
// rather than adding a dedicated GET-by-id route just for a breadcrumb label.
async function fetchDetailLabel(section: string, id: string): Promise<string | null> {
  try {
    if (section === "roles") {
      const roles = await fetch("/api/admin/roles").then((r) => r.json());
      return roles.find((r: { roleId: number }) => String(r.roleId) === id)?.roleName ?? null;
    }
    if (section === "teams") {
      const teams = await fetch("/api/admin/teams").then((r) => r.json());
      return teams.find((t: { teamId: number }) => String(t.teamId) === id)?.teamName ?? null;
    }
    if (section === "users") {
      const users = await fetch("/api/admin/users").then((r) => r.json());
      return users.find((u: { userId: string }) => u.userId === id)?.fullName ?? null;
    }
  } catch {
    // fall through to null — crumb just omits the detail label
  }
  return null;
}

export function AdminHeader({ user }: { user: SessionUser }) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const segments = (pathname ?? "").replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const [detailLabel, setDetailLabel] = useState<string | null>(null);

  const section   = segments[0];
  const detailId  = segments[1];

  useEffect(() => {
    setDetailLabel(null);
    if (section && detailId) {
      void fetchDetailLabel(section, detailId).then(setDetailLabel);
    }
  }, [section, detailId]);

  const crumbs: Crumb[] = [
    { label: "Bayanat", href: "/dashboard" },
    { label: "Administration", href: "/admin" },
  ];
  if (section) {
    crumbs.push({
      label: SECTION_LABELS[section] ?? titleize(section),
      href: `/admin/${section}`,
    });
  }
  if (section === "user-management") {
    const tab = searchParams.get("tab") ?? "users";
    crumbs.push({ label: USER_MGMT_TABS[tab] ?? titleize(tab) });
  } else if (section && detailId) {
    crumbs.push({ label: detailLabel ?? "…" });
  }

  return <Header crumbs={crumbs} user={user} />;
}
