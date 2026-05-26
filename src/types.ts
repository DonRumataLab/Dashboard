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

export type PortfolioItem = {
  id: string;
  index: string;
  collection: string;
  collectionClassifier: string;
  productType: string;
  productKind: string;
  nomenclature: string;
  supplier: string;
  status: string;
  qty: number;
  ppsPlan?: string;
  ppsFact?: string;
  qcPlan?: string;
  qcFact?: string;
  shipmentReadyPlan?: string;
  shipmentReadyFact?: string;
  fabricPlan?: string;
  fabricFact?: string;
  otcPlan?: string;
  otcFact?: string;
  artist: string;
  constructorName: string;
  technologist: string;
  fabricManager: string;
};

export type PortfolioSnapshot = {
  id: string;
  date: string;
  uploadedAt: string;
  sourceName: string;
  rows: PortfolioItem[];
};

export type DashboardType = "production" | "controlDates" | "portfolio";

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

export type DashboardTab = "overview" | "controlDates" | "portfolio" | "production" | "logistics" | "history" | "compare" | "admin";

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
