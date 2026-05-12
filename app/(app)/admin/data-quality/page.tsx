import { redirect } from "next/navigation";

// Data Quality has moved to /quality (available from the Domains sidebar section)
export default function DataQualityAdminRedirect() {
  redirect("/quality");
}
