"use client";

const ACCESS_TOKEN_KEY = "wgw.api.access_token";
const DRIVE_UPLOAD_CHUNK_SIZE = 1 * 1024 * 1024;

/** Virtual drive path for the REST API, e.g. {@code /users/alice/report.docx}. */
export function officeApiPathFromWebdavPathname(pathname: string): string {
  const idx = pathname.indexOf("/files/");
  if (idx === -1) {
    throw new Error("Not a WebDAV files path.");
  }
  const rel = pathname.slice(idx + "/files/".length).replace(/^\/+/, "");

  return `/${rel}`;
}

function parentAndName(path: string): { destination: string; filename: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) {
    return { destination: "/", filename: normalized.replace(/^\//, "") };
  }

  return { destination: normalized.slice(0, idx), filename: normalized.slice(idx + 1) };
}

function uploadIdentifier(name: string, size: number, lastModified: number): string {
  return `${name}-${size}-${lastModified}`;
}

function readAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);

  return token && token.trim() !== "" ? token.trim() : null;
}

function mimeForFilename(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/**
 * Persist document bytes via {@code POST /api/v1/drive/upload} (same transport as Docs).
 */
export async function savePluginDocumentViaDrive(
  webdavPathname: string,
  bytes: Uint8Array,
  filename: string,
  signal?: AbortSignal,
): Promise<void> {
  const token = readAccessToken();
  if (!token) {
    throw new Error("Missing API access token; sign in from the workspace shell first.");
  }

  const apiPath = officeApiPathFromWebdavPathname(webdavPathname);
  const { destination, filename: derivedName } = parentAndName(apiPath);
  const fileName = filename.trim() !== "" ? filename : derivedName;
  const file = new File([new Uint8Array(bytes)], fileName, {
    type: mimeForFilename(fileName),
    lastModified: Date.now(),
  });

  const authHeaders = { Authorization: `Bearer ${token}` };
  const probe = await fetch("/api/v1/drive/upload", {
    method: "GET",
    credentials: "include",
    headers: authHeaders,
    signal,
  });
  if (!probe.ok) {
    throw new Error(`Drive upload probe failed (${probe.status})`);
  }

  const fileChunks = Math.max(1, Math.ceil(file.size / DRIVE_UPLOAD_CHUNK_SIZE));
  const identifier = uploadIdentifier(file.name, file.size, file.lastModified);
  for (let chunkIndex = 0; chunkIndex < fileChunks; chunkIndex += 1) {
    const start = chunkIndex * DRIVE_UPLOAD_CHUNK_SIZE;
    const end = Math.min(file.size, start + DRIVE_UPLOAD_CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    const form = new FormData();
    form.append("file", chunkBlob, file.name);
    form.append("resumableFilename", file.name);
    form.append("resumableIdentifier", identifier);
    form.append("resumableChunkNumber", String(chunkIndex + 1));
    form.append("resumableTotalChunks", String(fileChunks));
    form.append("cwd", destination);

    const res = await fetch("/api/v1/drive/upload", {
      method: "POST",
      credentials: "include",
      headers: authHeaders,
      body: form,
      signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      throw new Error(
        detail !== ""
          ? `Drive upload failed (${res.status}): ${detail}`
          : `Drive upload failed (${res.status})`,
      );
    }
  }
}
