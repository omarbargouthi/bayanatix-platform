"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

// AC-7: matrix cells respect the same "as of" validity-date filtering as the
// graph — a link with an expired valid_to_date drops out by default and
// reappears once "as of" is set to a date it covers.
export function MatrixAsOfFilter({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setAsOf(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("asOf", value); else params.delete("asOf");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      As of
      <input
        type="date"
        defaultValue={defaultValue}
        onChange={(e) => setAsOf(e.target.value)}
        className="border border-line rounded px-1.5 py-1 text-xs text-ink"
      />
    </label>
  );
}
