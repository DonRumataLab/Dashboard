import type { ControlDateSnapshot, DashboardType, PortfolioSnapshot, Snapshot, UploadHistoryRecord } from "../types";

const meta = import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } };
const API_BASE_URL = meta.env?.VITE_API_BASE_URL ?? "";

type ServerSnapshot = {
  id: string;
  dashboardType: DashboardType;
  date: string;
  sourceName: string;
  uploadedAt: string;
  rowCount: number;
  payload: Snapshot | ControlDateSnapshot | PortfolioSnapshot;
};

export async function fetchServerState() {
  if (!API_BASE_URL && location.protocol === "file:") return null;

  const [snapshotsResponse, uploadsResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/api/snapshots`),
    fetch(`${API_BASE_URL}/api/uploads`),
  ]);

  if (!snapshotsResponse.ok || !uploadsResponse.ok) {
    throw new Error("Server API is unavailable");
  }

  const snapshotsJson = (await snapshotsResponse.json()) as { snapshots: ServerSnapshot[] };
  const uploadsJson = (await uploadsResponse.json()) as { uploads: UploadHistoryRecord[] };

  return {
    snapshots: snapshotsJson.snapshots,
    uploads: uploadsJson.uploads,
  };
}

export async function uploadSnapshotToServer({
  dashboardType,
  snapshotDate,
  file,
  payload,
}: {
  dashboardType: DashboardType;
  snapshotDate: string;
  file: File;
  payload: Snapshot | ControlDateSnapshot | PortfolioSnapshot;
}) {
  const fileBase64 = await fileToBase64(file);
  const response = await fetch(`${API_BASE_URL}/api/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dashboardType,
      snapshotDate,
      originalName: file.name,
      mimeType: file.type,
      fileBase64,
      payload,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error || "Upload failed");
  }

  return (await response.json()) as UploadHistoryRecord;
}

export async function deleteUploadFromServer(id: string) {
  const response = await fetch(`${API_BASE_URL}/api/uploads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error || "Delete failed");
  }
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read file"));
    reader.readAsDataURL(file);
  });
}
