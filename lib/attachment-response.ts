// The HTTP response for a stored document (compliance evidence, governance framework
// attachments). Sent for display in the browser (the preview: <img>, fetched text, or a
// PDF opened in its own tab) only when its type is one the browser displays safely;
// anything else, or a requested download, is sent as a download. Word and PowerPoint
// files are always sent as a download: their preview fetches the bytes and draws them
// with script (DocxPreview / PptxPreview), the browser never displays them itself.
import { INLINE_TYPES } from "./queries/compliance-evidence";

export function storedFileResponse(file: { fileName: string; mimeType: string; data: Buffer }, wantsDownload: boolean): Response {
  const inline = !wantsDownload && INLINE_TYPES.has(file.mimeType);
  // RFC 5987 form so names with non-ASCII characters (Arabic file names) survive.
  const asciiName = file.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? (file.mimeType.startsWith("text/") ? `${file.mimeType}; charset=utf-8` : file.mimeType) : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      // The type above is the one we stored from the file extension; the browser must not second-guess it.
      "X-Content-Type-Options": "nosniff",
      // A text file opened directly gets no script and no access to the application,
      // whatever it contains. (Not sent for PDFs: the browser's PDF viewer does not load in a sandbox.)
      ...(inline && file.mimeType.startsWith("text/") ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } : {}),
      "Cache-Control": "private, no-store",
    },
  });
}
