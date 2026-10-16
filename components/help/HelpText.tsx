// Renders a Help Center section body (the small text format described in lib/help/types.ts).
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/** `code`, **bold**, *italic* and [label](/path) inside a line. Code is matched first so
 *  a `*` inside it (e.g. a Vault path) is kept; bold and italic may hold code. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1] != null) out.push(<code key={k} className="px-1 py-0.5 rounded bg-canvas text-[0.92em]" dir="ltr">{m[1]}</code>);
    else if (m[2] != null) out.push(<strong key={k} className="font-semibold text-ink">{inline(m[2], k)}</strong>);
    else if (m[3] != null) out.push(<em key={k}>{inline(m[3], k)}</em>);
    else {
      const href = m[5];
      out.push(href.startsWith("/")
        ? <Link key={k} href={href} className="text-brand-purple font-medium hover:underline">{m[4]}</Link>
        : <a key={k} href={href} target="_blank" rel="noreferrer" className="text-brand-purple font-medium hover:underline">{m[4]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "note"; text: string }
  | { kind: "ul" | "ol"; items: { text: string; sub: string[] }[]; start?: number }
  | { kind: "table"; rows: string[][] }
  | { kind: "code"; lines: string[] };

/** A fenced block nested in a list item is indented; show it flush left. */
function dedent(lines: string[]): string[] {
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
  return Number.isFinite(indent) ? lines.map((l) => l.slice(indent)) : lines;
}

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let fence: string[] | null = null;
  const flush = () => { if (para.length) { blocks.push({ kind: "p", text: para.join(" ") }); para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    // A command block: lines between ``` fences, or consecutive lines starting with "$ ".
    if (t.startsWith("```")) {
      if (fence) { blocks.push({ kind: "code", lines: dedent(fence) }); fence = null; } else { flush(); fence = []; }
      continue;
    }
    if (fence) { fence.push(line); continue; }
    if (t === "$" || t.startsWith("$ ")) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "code") prev.lines.push(t.slice(2)); else blocks.push({ kind: "code", lines: [t.slice(2)] });
      continue;
    }
    if (!t) { flush(); continue; }
    const heading = /^#{1,3} (.*)$/.exec(t);
    if (heading) { flush(); blocks.push({ kind: "h", text: heading[1] }); continue; }
    if (t.startsWith("> ")) { flush(); blocks.push({ kind: "note", text: t.slice(2) }); continue; }
    if (t.startsWith("|")) {
      flush();
      const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "table") prev.rows.push(cells); else blocks.push({ kind: "table", rows: [cells] });
      continue;
    }
    const bullet = /^- (.*)$/.exec(t), num = /^(\d+)\. (.*)$/.exec(t);
    const indented = /^\s{2,}/.test(line);
    const prev = blocks[blocks.length - 1];
    if (indented && (bullet || num) && prev && (prev.kind === "ul" || prev.kind === "ol") && para.length === 0) {
      prev.items[prev.items.length - 1].sub.push(bullet ? bullet[1] : num![2]);
      continue;
    }
    if (bullet || num) {
      // A paragraph line just before the item ends there; the item then joins only a
      // list that is still the last block (not one before that paragraph).
      flush();
      const last = blocks[blocks.length - 1];
      const kind = bullet ? "ul" : "ol";
      const text = bullet ? bullet[1] : num![2];
      // A numbered list interrupted by a command or a sub-list keeps its numbering ("3." stays 3).
      if (last?.kind === kind) last.items.push({ text, sub: [] });
      else blocks.push({ kind, items: [{ text, sub: [] }], start: num ? Number(num[1]) : undefined });
      continue;
    }
    para.push(t);
  }
  flush();
  if (fence) blocks.push({ kind: "code", lines: dedent(fence) });
  return blocks;
}

export function HelpText({ body, compact }: { body: string; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-2 text-[13px] leading-relaxed" : "space-y-3 text-[14px] leading-relaxed text-ink-soft"}>
      {parse(body).map((b, bi) => {
        const k = `b${bi}`;
        if (b.kind === "code") return (
          <pre key={k} dir="ltr" className="text-start bg-brand-deep text-white/90 rounded-md px-3 py-2 text-[12px] leading-snug overflow-x-auto nice-scroll whitespace-pre"><code>{b.lines.join("\n")}</code></pre>
        );
        if (b.kind === "p") return <p key={k} dir="auto">{inline(b.text, k)}</p>;
        if (b.kind === "h") return <h3 key={k} dir="auto" className={`${compact ? "text-[13px] pt-1" : "text-[15px] pt-2"} font-bold text-brand-deep`}>{inline(b.text, k)}</h3>;
        if (b.kind === "note") return (
          <div key={k} dir="auto" className="border-s-4 border-brand-purple/40 bg-brand-purple/5 rounded-e-md px-4 py-2.5 text-[13.5px]">{inline(b.text, k)}</div>
        );
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind === "ul" ? "ul" : "ol";
          return (
            <List key={k} start={b.kind === "ol" && b.start && b.start > 1 ? b.start : undefined} className={`${b.kind === "ul" ? "list-disc" : "list-decimal"} ps-5 space-y-1.5`}>
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
