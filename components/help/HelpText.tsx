// Renders a Help Center section body (the small text format described in lib/help/types.ts).
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/** **bold** and [label](/path) inside a line. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1] != null) out.push(<strong key={k} className="font-semibold text-ink">{m[1]}</strong>);
    else if (m[2] != null) {
      const href = m[3];
      out.push(href.startsWith("/")
        ? <Link key={k} href={href} className="text-brand-purple font-medium hover:underline">{m[2]}</Link>
        : <a key={k} href={href} target="_blank" rel="noreferrer" className="text-brand-purple font-medium hover:underline">{m[2]}</a>);
    } else out.push(<code key={k} className="px-1 py-0.5 rounded bg-canvas text-[0.92em]" dir="ltr">{m[4]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "note"; text: string }
  | { kind: "ul" | "ol"; items: { text: string; sub: string[] }[] }
  | { kind: "table"; rows: string[][] };

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: "p", text: para.join(" ") }); para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith("### ")) { flush(); blocks.push({ kind: "h", text: t.slice(4) }); continue; }
    if (t.startsWith("> ")) { flush(); blocks.push({ kind: "note", text: t.slice(2) }); continue; }
    if (t.startsWith("|")) {
      flush();
      const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "table") prev.rows.push(cells); else blocks.push({ kind: "table", rows: [cells] });
      continue;
    }
    const bullet = /^- (.*)$/.exec(t), num = /^\d+\. (.*)$/.exec(t);
    const indented = /^\s{2,}/.test(line);
    const prev = blocks[blocks.length - 1];
    if (indented && (bullet || num) && prev && (prev.kind === "ul" || prev.kind === "ol") && para.length === 0) {
      prev.items[prev.items.length - 1].sub.push((bullet ?? num)![1]);
      continue;
    }
    if (bullet || num) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const text = (bullet ?? num)![1];
      if (prev?.kind === kind) prev.items.push({ text, sub: [] }); else blocks.push({ kind, items: [{ text, sub: [] }] });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

export function HelpText({ body }: { body: string }) {
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-ink-soft">
      {parse(body).map((b, bi) => {
        const k = `b${bi}`;
        if (b.kind === "p") return <p key={k} dir="auto">{inline(b.text, k)}</p>;
        if (b.kind === "h") return <h3 key={k} dir="auto" className="text-[15px] font-bold text-brand-deep pt-2">{inline(b.text, k)}</h3>;
        if (b.kind === "note") return (
          <div key={k} dir="auto" className="border-s-4 border-brand-purple/40 bg-brand-purple/5 rounded-e-md px-4 py-2.5 text-[13.5px]">{inline(b.text, k)}</div>
        );
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind === "ul" ? "ul" : "ol";
          return (
            <List key={k} className={`${b.kind === "ul" ? "list-disc" : "list-decimal"} ps-5 space-y-1.5`}>
              {b.items.map((it, ii) => (
                <li key={ii} dir="auto">
                  {inline(it.text, `${k}-${ii}`)}
                  {it.sub.length > 0 && (
                    <ul className="list-[circle] ps-5 mt-1 space-y-1">
                      {it.sub.map((s, si) => <li key={si} dir="auto">{inline(s, `${k}-${ii}-${si}`)}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </List>
          );
        }
        if (b.kind !== "table") return null;
        const [head, ...rows] = b.rows;
        return (
          <div key={k} className="overflow-x-auto nice-scroll border border-line rounded-lg">
            <table className="w-full text-[13px]">
              <thead className="bg-canvas">
                <tr>{head.map((c, ci) => <th key={ci} dir="auto" className="text-start font-semibold text-ink px-3 py-2 border-b border-line align-bottom">{inline(c, `${k}-h${ci}`)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-line-soft last:border-0">
                    {r.map((c, ci) => (
                      <td key={ci} dir="auto" className={`px-3 py-2 align-top ${ci === 0 ? "text-ink font-medium" : ""}`}>
                        <Fragment>{inline(c, `${k}-${ri}-${ci}`)}</Fragment>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
