import { redirect } from "next/navigation";

// Column type review now lives as a tab on the AI Enrichment hub (one place
// for all AI-suggestion review) instead of its own sidebar page — redirect
// any old links/bookmarks there rather than 404ing.
export default function ColumnTypesPage() {
  redirect("/enrichment");
}
