export type WorkItem = {
  id: string;
  order: string;
  article: string;
  product: string;
  department: string;
  planQty: number;
  factQty: number;
  shippedQty: number;
  defectQty: number;
  status: string;
  dueDate?: string;
};

export type Snapshot = {
  id: string;
  date: string;
  uploadedAt: string;
  sourceName: string;
  rows: WorkItem[];
};

export type ControlMilestone = {
  name: string;
  date?: string;
  daysFromPrevious?: number;
};

export type ControlDateRow = {
  id: string;
  collection: string;
  milestones: ControlMilestone[];
};

export type ControlDateSnapshot = {
  id: string;
  date: string;
  uploadedAt: string;
  sourceName: string;
  rows: ControlDateRow[];
};

export type DashboardType = "production" | "controlDates";

export type UploadHistoryRecord = {
  id: string;
  dashboardType: DashboardType;
  snapshotDate: string;
  originalName: string;
  storedName: string;
  fileSize: number;
  mimeType?: string;
  uploadedAt: string;
  uploaderIp: string;
  rowCount: number;
};

export type DashboardTab = "overview" | "controlDates" | "production" | "logistics" | "history" | "compare" | "admin";

export type KpiSet = {
  planQty: number;
  factQty: number;
  shippedQty: number;
  defectQty: number;
  completionPct: number;
  shipmentPct: number;
  defectPct: number;
  activeOrders: number;
  overdueOrders: number;
};
