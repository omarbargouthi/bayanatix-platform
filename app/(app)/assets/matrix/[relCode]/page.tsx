import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getRelationshipTypeByCode, getRelationshipMatrix } from "@/lib/queries/custom-assets";
import { MatrixAsOfFilter } from "@/components/custom-assets/MatrixAsOfFilter";

export const dynamic = "force-dynamic";

export default async function MatrixPage({ params, searchParams }: { params: { relCode: string }; searchParams: { asOf?: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const relType = await getRelationshipTypeByCode(params.relCode.toUpperCase());
  if (!relType) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const asOf = searchParams.asOf || today;
  const matrix = await getRelationshipMatrix(relType.relTypeId, asOf);
  if (!matrix) notFound();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Custom Assets", href: "/assets" },
          { label: `${relType.relNameText} Matrix` },
        ]}
        user={user}
      />
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-deep">{relType.relNameText} Matrix</h1>
            <p className="text-[12px] text-muted mt-0.5">
              {relType.fromEndpoints[0]?.replace("CUSTOM:", "")} × {relType.toEndpoints[0]?.replace("CUSTOM:", "")}
              {relType.cardinalityCode !== "M:N" && (
                <span className="ml-2 text-amber-600">— this relationship type is {relType.cardinalityCode}, a matrix is most meaningful for M:N</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <MatrixAsOfFilter defaultValue={asOf} />
            <a href={`/api/custom-assets/matrix/${params.relCode}/export?asOf=${asOf}`} className="btn btn-primary text-sm">⭳ Export XLSX</a>
          </div>
        </div>
        {asOf !== today && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 -mt-2">
            Showing links valid as of {asOf} — not today.{" "}
            <Link href={`/assets/matrix/${params.relCode}`} className="underline font-medium">Reset to today</Link>
          </p>
        )}

        {matrix.rows.length === 0 || matrix.cols.length === 0 ? (
          <div className="card p-10 text-center text-muted">No instances yet on one or both sides of this relationship.</div>
        ) : (
          <div className="card p-0 overflow-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-canvas-soft border-b border-r border-line px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted">
                    {relType.fromEndpoints[0]?.replace("CUSTOM:", "")}
                  </th>
                  {matrix.cols.map((col) => (
                    <th key={col.id} className="border-b border-line px-3 py-2 text-left text-[12px] font-semibold whitespace-nowrap">
                      {col.href ? <Link href={col.href} className="text-brand-purple hover:underline">{col.name}</Link> : col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas-soft">
                    <td className="sticky left-0 bg-white border-r border-b border-line-soft px-3 py-2 font-medium whitespace-nowrap">
                      {row.href ? <Link href={row.href} className="text-brand-purple hover:underline">{row.name}</Link> : row.name}
                    </td>
                    {matrix.cols.map((col) => {
                      const cell = matrix.cells[`${row.id}:${col.id}`];
                      return (
                        <td key={col.id} className="border-b border-line-soft px-3 py-2 text-center">
                          {cell === undefined ? (
                            <span className="text-line">—</span>
                          ) : cell === null ? (
                            <span className="text-emerald-600 font-bold">✓</span>
                          ) : (
                            <span className="text-[11px] text-ink-soft">
                              {Object.entries(cell).map(([k, v]) => `${k}: ${v}`).join(", ")}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
