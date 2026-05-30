import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getSchemaById } from "@/lib/queries/catalog";
import { trackAssetVisit } from "@/lib/queries/dashboard";
import { HighlightScroll } from "@/components/catalog/HighlightScroll";
import { SchemaHero } from "@/components/catalog/SchemaHero";
import { SchemaTableList } from "@/components/catalog/SchemaTableList";
import { DataModelTab } from "@/components/catalog/DataModelTab";
import { SchemaTabNav } from "./SchemaTabNav";

export const dynamic = "force-dynamic";

export default async function SchemaPage({
  params,
  searchParams,
}: {
  params:       { schemaId: string };
  searchParams: { highlight?: string; view?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.schemaId);
  if (!Number.isFinite(id)) notFound();
  const schema = await getSchemaById(id);
  if (!schema) notFound();

  const canEdit = await canEditMetadata(user);
  void trackAssetVisit(user.userId, "SCHEMA", String(id), schema.schemaName, schema.sourceName).catch(() => {});
  const highlightId = searchParams.highlight ? Number(searchParams.highlight) : null;
  const activeView = searchParams.view ?? "tables";

  const tables    = schema.entities.filter((e) => !e.isView);
  const views     = schema.entities.filter((e) => e.isView);
  const totalCols = schema.entities.reduce((s, e) => s + (e.columnCount ?? 0), 0);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog", href: "/catalog" },
          ...(schema.source ? [{ label: schema.source.sourceName, href: "/catalog" }] : []),
          { label: schema.schemaName },
        ]}
        user={user}
        contextTypes={["TABLE", "VIEW", "COLUMN", "TERM"]}
      />

      {highlightId && <HighlightScroll entityId={highlightId} />}

      <main className="px-8 py-7 pb-14">
        <SchemaHero
          schema={schema}
          tables={tables.length}
          views={views.length}
          totalCols={totalCols}
          canEdit={canEdit}
        />

        <SchemaTabNav schemaId={id} activeView={activeView} />

        {activeView === "data-model" ? (
          <DataModelTab schemaId={id} />
        ) : (
          <SchemaTableList
            entities={schema.entities}
            schemaId={schema.schemaId}
            canEdit={canEdit}
          />
        )}
      </main>
    </>
  );
}
