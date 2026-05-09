import Link from "next/link";

// Token format in message body:
//   #asset[path|assetType|assetId]   — data / glossary reference
//   #user[userId|displayName]         — user mention

type Part =
  | { kind: "text"; text: string }
  | { kind: "asset"; path: string; assetType: string; assetId: string }
  | { kind: "user"; userId: string; name: string };

const ALL_RE = /(#(?:asset|user)\[[^\]]+\])/g;

function tokenize(body: string): Part[] {
  const parts: Part[] = [];
  const segs = body.split(ALL_RE);
  for (const seg of segs) {
    if (seg.startsWith("#asset[")) {
      const inner = seg.slice(7, -1);
      const [path, assetType, assetId] = inner.split("|");
      parts.push({ kind: "asset", path: path ?? "", assetType: assetType ?? "", assetId: assetId ?? "" });
    } else if (seg.startsWith("#user[")) {
      const inner = seg.slice(6, -1);
      const [userId, name] = inner.split("|");
      parts.push({ kind: "user", userId: userId ?? "", name: name ?? userId ?? "" });
    } else if (seg) {
      parts.push({ kind: "text", text: seg });
    }
  }
  return parts;
}

function assetUrl(assetType: string, assetId: string): string {
  const ids = assetId.split(":");
  switch (assetType) {
    case "DATA_SOURCE":   return "/catalog";
    case "SCHEMA":        return `/catalog/${ids[0]}`;
    case "TABLE":         return `/catalog/${ids[1]}/tables/${ids[0]}`;
    case "COLUMN":        return `/catalog/${ids[2]}/tables/${ids[1]}`;
    case "GLOSSARY_DOMAIN": return "/glossary";
    case "GLOSSARY_TERM": return `/glossary/${ids[0]}`;
    default:              return "/catalog";
  }
}

const ASSET_ICON: Record<string, string> = {
  DATA_SOURCE: "🗄",
  SCHEMA: "📂",
  TABLE: "📊",
  COLUMN: "📋",
  GLOSSARY_DOMAIN: "📖",
  GLOSSARY_TERM: "📖",
};

export function RichBody({ body, className }: { body: string; className?: string }) {
  const parts = tokenize(body);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.kind === "text") {
          return <span key={i}>{p.text}</span>;
        }
        if (p.kind === "asset") {
          return (
            <Link key={i} href={assetUrl(p.assetType, p.assetId)}
              className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded-md text-[12px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors no-underline">
              <span className="text-[11px]">{ASSET_ICON[p.assetType] ?? "📌"}</span>
              {p.path}
            </Link>
          );
        }
        // user mention
        return (
          <span key={i}
            className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded-md text-[12px] font-semibold bg-brand-purple/10 text-brand-purple border border-brand-purple/20">
            @{p.name}
          </span>
        );
      })}
    </span>
  );
}
