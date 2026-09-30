import { verifyLicense } from "@/lib/license/verify";

export default async function LicenseExpiredPage() {
  const status = await verifyLicense(process.env.LICENSE_KEY);

  const detail =
    status.state === "expired"
      ? `Your Bayanatix license expired on ${new Date(status.expiresAt).toLocaleDateString()}.`
      : status.state === "invalid"
      ? "Your Bayanatix license key is invalid for this deployment."
      : "No Bayanatix license key was found for this deployment.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="max-w-md w-full bg-white border border-line rounded-xl shadow-sm p-8 text-center space-y-3">
        <h1 className="text-xl font-bold text-ink">License required</h1>
        <p className="text-sm text-ink-soft">{detail}</p>
        <p className="text-sm text-ink-soft">
          Please contact Bayanatix to renew your subscription and restore access.
        </p>
      </div>
    </main>
  );
}
