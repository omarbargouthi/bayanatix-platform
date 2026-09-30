import type { LicenseStatus } from "@/lib/license/types";

export function LicenseBanner({ status }: { status: LicenseStatus }) {
  if (status.state !== "grace") return null;
  const day = status.daysRemaining === 1 ? "day" : "days";
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center">
      Your Bayanatix license expires in {status.daysRemaining} {day}. Contact Bayanatix to renew and avoid interruption.
    </div>
  );
}
