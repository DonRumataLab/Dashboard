import { createServer } from "node:http";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const dataDir = process.env.PORTAL_DATA_DIR || join(rootDir, "server-data");
const uploadDir = join(dataDir, "uploads");
const dbPath = join(dataDir, "portal.sqlite");
const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.CORS_ORIGIN || "*";

await mkdir(uploadDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    dashboard_type TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    uploaded_at TEXT NOT NULL,
    uploader_ip TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_uploads_dashboard_date
    ON uploads (dashboard_type, snapshot_date, uploaded_at);
`);

const insertUpload = db.prepare(`
  INSERT INTO uploads (
    id, dashboard_type, snapshot_date, original_name, stored_name, file_path,
    file_size, mime_type, uploaded_at, uploader_ip, row_count, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listUploads = db.prepare(`
  SELECT id, dashboard_type, snapshot_date, original_name, stored_name, file_size,
         mime_type, uploaded_at, uploader_ip, row_count
  FROM uploads
  ORDER BY uploaded_at DESC
`);

const listSnapshots = db.prepare(`
  SELECT id, dashboard_type, snapshot_date, original_name, uploaded_at, row_count, payload_json
  FROM uploads
  ORDER BY snapshot_date ASC, uploaded_at ASC
`);

const getUpload = db.prepare(`
  SELECT id, file_path
  FROM uploads
  WHERE id = ?
`);

const deleteUpload = db.prepare(`
  DELETE FROM uploads
  WHERE id = ?
`);

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, { ok: true, dbPath });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/uploads") {
      sendJson(response, { uploads: listUploads.all() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/snapshots") {
      const snapshots = listSnapshots.all().map((row) => ({
        id: row.id,
        dashboardType: row.dashboard_type,
        date: row.snapshot_date,
        sourceName: row.original_name,
        uploadedAt: row.uploaded_at,
        rowCount: row.row_count,
        payload: JSON.parse(row.payload_json),
      }));
      sendJson(response, { snapshots });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/uploads") {
      const body = await readJson(request);
      const record = await persistUpload(body, getClientIp(request));
      sendJson(response, record, 201);
      return;
    }

    const deleteMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const deleted = await removeUpload(deleteMatch[1]);
      sendJson(response, deleted);
      return;
    }

    sendJson(response, { error: "Not found" }, 404);
  } catch (error) {
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
    sendJson(response, { error: error instanceof Error ? error.message : "Internal server error" }, status);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`M-Rizen dashboard API listening on http://127.0.0.1:${port}`);
});

async function persistUpload(body, uploaderIp) {
  const id = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const dashboardType = String(body.dashboardType || "");
  const snapshotDate = String(body.snapshotDate || "");
  const originalName = String(body.originalName || "upload.xlsx");
  const mimeType = String(body.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const payload = body.payload;
  const fileBase64 = String(body.fileBase64 || "");

  if (!dashboardType || !snapshotDate || !payload) {
    throw new Error("dashboardType, snapshotDate and payload are required");
  }

  const extension = sanitizeExtension(extname(originalName) || ".xlsx");
  const storedName = `${snapshotDate}-${dashboardType}-${id}${extension}`;
  const filePath = join(uploadDir, storedName);
  const bytes = fileBase64 ? Buffer.from(fileBase64, "base64") : Buffer.alloc(0);
  await writeFile(filePath, bytes);

  const rowCount = Array.isArray(payload.rows) ? payload.rows.length : 0;
  insertUpload.run(
    id,
    dashboardType,
    snapshotDate,
    originalName,
    storedName,
    filePath,
    bytes.byteLength,
    mimeType,
    uploadedAt,
    uploaderIp,
    rowCount,
    JSON.stringify(payload),
  );

  return {
    id,
    dashboardType,
    snapshotDate,
    originalName,
    storedName,
    fileSize: bytes.byteLength,
    mimeType,
    uploadedAt,
    uploaderIp,
    rowCount,
  };
}

async function removeUpload(id) {
  const record = getUpload.get(id);
  if (!record) {
    const error = new Error("Upload not found");
    error.statusCode = 404;
    throw error;
  }

  deleteUpload.run(id);
  await unlink(record.file_path).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });

  return { deleted: true, id };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 80 * 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function sanitizeExtension(extension) {
  return existsSync(join(rootDir, "package.json")) && [".xlsx", ".xls"].includes(extension.toLowerCase()) ? extension.toLowerCase() : ".xlsx";
}
