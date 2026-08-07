import type { SessionUser } from "@/lib/types";

export type SourceRef = {
  assetType: string;
  assetId:   number;
  label:     string;
  href:      string | null;
};

export type ToolExecContext = { session: SessionUser };

export type ToolResult =
  | { ok: true; data: unknown; sources: SourceRef[] }
  | { ok: false; error: string };

export type ToolDefinition = {
  name:        string;
  description: string;
  inputSchema: object;
  run: (args: Record<string, unknown>, ctx: ToolExecContext) => Promise<ToolResult>;
};
