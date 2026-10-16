// The Help Center's documents. Written in English in lib/help/docs/*; every title,
// summary and section is also a translation key (category HELP_DOCS), so other
// languages are translated in Languages & Translations like any other content.
//
// A section body is plain text with a few marks, read by components/help/HelpText:
//   blank line        new paragraph
//   "- " / "1. "      bulleted / numbered list item
//   "### "            sub-heading
//   "| a | b |"       table row; the first row is the header, a "|---|" row is skipped
//   "> "              note
//   "$ command"       a command, shown in a code block (consecutive lines form one block)
//   **bold**, *italic*, `code`, [label](/path)

export const HELP_GROUPS = ["start", "workspace", "catalog", "domains", "privacy", "reports", "admin", "support"] as const;
export type HelpGroup = typeof HELP_GROUPS[number];

export type HelpSection = { id: string; title: string; body: string };

export type HelpDoc = {
  slug: string;
  group: HelpGroup;
  title: string;
  summary: string;
  /** The page in the app this document is about, for the "Open" link. */
  page?: string;
  sections: HelpSection[];
  /** Who may read it: "ADMIN" documents (technical support) are shown only to platform administrators. */
  audience?: "ADMIN";
  /** Slugs of related documents. */
  related?: string[];
};

/** A document as served to the reader, in the reader's language. */
export type HelpDocView = Omit<HelpDoc, "related"> & { related: { slug: string; title: string }[] };
export type HelpIndexEntry = { slug: string; group: HelpGroup; title: string; summary: string };

export const HELP_CATEGORY = "HELP_DOCS";
export const helpKey = (slug: string, part: string) => `helpdoc.${slug}.${part}`;
