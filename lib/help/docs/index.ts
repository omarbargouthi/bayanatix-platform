// The Help Center's documents, in reading order. Keep every statement true of the
// shipped product: when a feature changes, update its document here. The texts are
// registered for translation automatically (lib/help/content.ts) and changed ones are
// marked out of date in Languages & Translations.
import type { HelpDoc } from "../types";
import { START_DOCS } from "./start";
import { WORKSPACE_DOCS } from "./workspace";
import { CATALOG_DOCS } from "./catalog";
import { DOMAIN_DOCS } from "./domains";
import { PRIVACY_DOCS } from "./privacy";
import { REPORT_DOCS } from "./reports";
import { ADMIN_DOCS } from "./admin";
import { SUPPORT_DOCS } from "./support";

export const HELP_DOCS: HelpDoc[] = [
  ...START_DOCS, ...WORKSPACE_DOCS, ...CATALOG_DOCS, ...DOMAIN_DOCS, ...PRIVACY_DOCS, ...REPORT_DOCS, ...ADMIN_DOCS, ...SUPPORT_DOCS,
];
