import * as XLSX from "xlsx";
import type { ControlDateRow, ControlDateSnapshot, KpiSet, Snapshot, WorkItem } from "../types";

const STORAGE_KEY = "m-rizen-dashboard-snapshots";
const CONTROL_DATES_STORAGE_KEY = "m-rizen-control-date-snapshots";

const aliases = {
  order: ["заказ", "номер заказа", "заказ покупателя", "order", "заказ-наряд"],
  article: ["артикул", "номенклатура", "код", "sku"],
  product: ["изделие", "товар", "наименование", "продукция", "модель"],
  department: ["цех", "участок", "подразделение", "производство"],
  planQty: ["план", "план шт", "количество план", "плановое количество", "qty plan"],
  factQty: ["факт", "факт шт", "количество факт", "выпущено", "готово", "qty fact"],
  shippedQty: ["отгружено", "отгрузка", "логистика факт", "shipment", "shipped"],
  defectQty: ["брак", "дефект", "дефекты", "списано"],
  status: ["статус", "состояние", "этап"],
  dueDate: ["дата плана", "плановая дата", "срок", "дедлайн", "дата отгрузки"],
} satisfies Record<keyof Omit<WorkItem, "id">, string[]>;

export function loadSnapshots(): Snapshot[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Snapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnapshots(snapshots: Snapshot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
}

export function loadControlDateSnapshots(): ControlDateSnapshot[] {
  const raw = localStorage.getItem(CONTROL_DATES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ControlDateSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveControlDateSnapshots(snapshots: ControlDateSnapshot[]) {
  localStorage.setItem(CONTROL_DATES_STORAGE_KEY, JSON.stringify(snapshots));
}

export async function parseWorkbook(file: File, snapshotDate: string): Promise<Snapshot> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const items = rows.map(normalizeRow).filter((row) => row.planQty || row.factQty || row.shippedQty);

  return {
    id: createClientId(),
    date: snapshotDate,
    uploadedAt: new Date().toISOString(),
    sourceName: file.name,
    rows: items,
  };
}

export async function parseControlDatesWorkbook(file: File, snapshotDate: string): Promise<ControlDateSnapshot | null> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const title = String(matrix[0]?.[0] ?? "").toLowerCase();
  const headers = matrix[1] ?? [];

  if (!title.includes("контрольные даты")) return null;

  const milestoneColumns = headers
    .map((header, index) => ({ name: cleanLabel(header), index }))
    .filter((header) => header.index > 0 && header.name && header.name !== "Количество дней");

  const rows: ControlDateRow[] = matrix
    .slice(2)
    .map((row) => parseControlDateRow(row, milestoneColumns))
    .filter((row): row is ControlDateRow => Boolean(row?.collection));

  return {
    id: createClientId(),
    date: snapshotDate,
    uploadedAt: new Date().toISOString(),
    sourceName: file.name,
    rows,
  };
}

export function calculateKpis(rows: WorkItem[]): KpiSet {
  const planQty = sum(rows, "planQty");
  const factQty = sum(rows, "factQty");
  const shippedQty = sum(rows, "shippedQty");
  const defectQty = sum(rows, "defectQty");
  const today = new Date();

  return {
    planQty,
    factQty,
    shippedQty,
    defectQty,
    completionPct: ratio(factQty, planQty),
    shipmentPct: ratio(shippedQty, planQty),
    defectPct: ratio(defectQty, Math.max(factQty, 1)),
    activeOrders: new Set(rows.map((row) => row.order).filter(Boolean)).size,
    overdueOrders: rows.filter((row) => row.dueDate && new Date(row.dueDate) < today && row.factQty < row.planQty).length,
  };
}

export function groupByDepartment(rows: WorkItem[]) {
  return Object.values(
    rows.reduce<Record<string, { department: string; plan: number; fact: number; shipped: number }>>((acc, row) => {
      const key = row.department || "Без участка";
      acc[key] ??= { department: key, plan: 0, fact: 0, shipped: 0 };
      acc[key].plan += row.planQty;
      acc[key].fact += row.factQty;
      acc[key].shipped += row.shippedQty;
      return acc;
    }, {}),
  );
}

export function groupByStatus(rows: WorkItem[]) {
  return Object.values(
    rows.reduce<Record<string, { status: string; count: number; plan: number }>>((acc, row) => {
      const key = row.status || "Не указан";
      acc[key] ??= { status: key, count: 0, plan: 0 };
      acc[key].count += 1;
      acc[key].plan += row.planQty;
      return acc;
    }, {}),
  );
}

export function buildHistory(snapshots: Snapshot[]) {
  return snapshots
    .map((snapshot) => ({ date: snapshot.date, ...calculateKpis(snapshot.rows) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function compareSnapshots(left?: Snapshot, right?: Snapshot) {
  if (!left || !right) return [];
  const leftKpis = calculateKpis(left.rows);
  const rightKpis = calculateKpis(right.rows);
  return [
    metric("План, шт", leftKpis.planQty, rightKpis.planQty),
    metric("Факт, шт", leftKpis.factQty, rightKpis.factQty),
    metric("Отгружено, шт", leftKpis.shippedQty, rightKpis.shippedQty),
    metric("Выполнение", leftKpis.completionPct, rightKpis.completionPct, "%"),
    metric("Просрочено заказов", leftKpis.overdueOrders, rightKpis.overdueOrders),
  ];
}

export function calculateControlDateKpis(snapshot?: ControlDateSnapshot) {
  const milestones = flattenControlMilestones(snapshot);
  const today = startOfDay(new Date());
  const soonLimit = addDays(today, 14);
  return {
    collections: snapshot?.rows.length ?? 0,
    totalMilestones: milestones.length,
    pastMilestones: milestones.filter((item) => item.date && startOfDay(new Date(item.date)) < today).length,
    nextMilestones: milestones.filter((item) => {
      if (!item.date) return false;
      const date = startOfDay(new Date(item.date));
      return date >= today && date <= soonLimit;
    }).length,
    emptyDates: milestones.filter((item) => !item.date).length,
  };
}

export function flattenControlMilestones(snapshot?: ControlDateSnapshot) {
  return (snapshot?.rows ?? []).flatMap((row) =>
    row.milestones.map((milestone) => ({
      collection: row.collection,
      ...milestone,
    })),
  );
}

export function getUpcomingControlMilestones(snapshot?: ControlDateSnapshot, limit = 10) {
  const today = startOfDay(new Date());
  return flattenControlMilestones(snapshot)
    .filter((item) => item.date && startOfDay(new Date(item.date)) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, limit);
}

export function buildControlDateStatus(snapshot?: ControlDateSnapshot) {
  const today = startOfDay(new Date());
  return (snapshot?.rows ?? []).map((row) => {
    const dated = row.milestones.filter((milestone) => milestone.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const next = dated.find((milestone) => startOfDay(new Date(milestone.date!)) >= today);
    const previous = [...dated].reverse().find((milestone) => startOfDay(new Date(milestone.date!)) < today);
    const lastDate = dated.at(-1)?.date;
    const progressPct = dated.length ? Math.round(((previous ? dated.indexOf(previous) + 1 : 0) / dated.length) * 100) : 0;
    return {
      collection: row.collection,
      previousName: previous?.name ?? "Нет",
      nextName: next?.name ?? "Завершено",
      nextDate: next?.date ?? lastDate,
      progressPct,
    };
  });
}

export function buildControlTimeline(snapshot?: ControlDateSnapshot) {
  const datedMilestones = flattenControlMilestones(snapshot).filter((item) => item.date);
  if (!datedMilestones.length) {
    return { startDate: undefined, endDate: undefined, rows: [] };
  }

  const timestamps = datedMilestones.map((item) => new Date(item.date!).getTime());
  const start = new Date(Math.min(...timestamps));
  const end = new Date(Math.max(...timestamps));
  const totalDays = Math.max(1, daysBetween(start, end));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    rows: (snapshot?.rows ?? []).map((row) => {
      const milestones = row.milestones
        .filter((milestone) => milestone.date)
        .map((milestone) => {
          const date = new Date(milestone.date!);
          return {
            ...milestone,
            offsetPct: Math.max(0, Math.min(100, (daysBetween(start, date) / totalDays) * 100)),
          };
        });
      const rowStart = milestones.at(0)?.date;
      const rowEnd = milestones.at(-1)?.date;
      return {
        collection: row.collection,
        startDate: rowStart,
        endDate: rowEnd,
        milestones,
      };
    }),
  };
}

export function buildControlDateIntervals(snapshot?: ControlDateSnapshot, limit = 8) {
  return (snapshot?.rows ?? [])
    .flatMap((row) => {
      const dated = row.milestones.filter((milestone) => milestone.date);
      return dated.slice(1).map((milestone, index) => {
        const previous = dated[index];
        return {
          collection: row.collection,
          from: previous.name,
          to: milestone.name,
          fromDate: previous.date!,
          toDate: milestone.date!,
          days: daysBetween(new Date(previous.date!), new Date(milestone.date!)),
        };
      });
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}

export function buildControlDateIssues(snapshot?: ControlDateSnapshot, limit = 12) {
  return (snapshot?.rows ?? [])
    .flatMap((row) => {
      const issues: Array<{ collection: string; type: string; detail: string; severity: "warning" | "danger" }> = [];
      let previousDated: ControlDateRow["milestones"][number] | undefined;
      let hadDate = false;

      row.milestones.forEach((milestone) => {
        if (!milestone.date) {
          if (hadDate) {
            issues.push({
              collection: row.collection,
              type: "Нет даты",
              detail: milestone.name,
              severity: "warning",
            });
          }
          return;
        }

        hadDate = true;
        if (previousDated) {
          const days = daysBetween(new Date(previousDated.date!), new Date(milestone.date));
          if (days < 0) {
            issues.push({
              collection: row.collection,
              type: "Нарушена последовательность",
              detail: `${previousDated.name} -> ${milestone.name}: ${days} дн.`,
              severity: "danger",
            });
          }
        }
        previousDated = milestone;
      });

      return issues;
    })
    .slice(0, limit);
}

function normalizeRow(row: Record<string, unknown>, index: number): WorkItem {
  return {
    id: createClientId(),
    order: stringValue(row, aliases.order) || `Строка ${index + 1}`,
    article: stringValue(row, aliases.article),
    product: stringValue(row, aliases.product) || stringValue(row, aliases.article) || "Изделие",
    department: stringValue(row, aliases.department) || "Основной цех",
    planQty: numberValue(row, aliases.planQty),
    factQty: numberValue(row, aliases.factQty),
    shippedQty: numberValue(row, aliases.shippedQty),
    defectQty: numberValue(row, aliases.defectQty),
    status: stringValue(row, aliases.status) || "В работе",
    dueDate: dateValue(row, aliases.dueDate),
  };
}

function parseControlDateRow(
  row: unknown[],
  milestoneColumns: Array<{ name: string; index: number }>,
): ControlDateRow | null {
  const collection = cleanLabel(row[0]);
  if (!collection) return null;

  let previousDate: string | undefined;
  const milestones = milestoneColumns.map(({ name, index }) => {
    const date = parseFlexibleDate(row[index], previousDate);
    const daysFromPrevious = numberFromUnknown(row[index + 1]);
    if (date) previousDate = date;
    return {
      name,
      date,
      daysFromPrevious: daysFromPrevious || undefined,
    };
  });

  return {
    id: createClientId(),
    collection,
    milestones,
  };
}

function cleanLabel(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFlexibleDate(value: unknown, previousDate?: string) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return undefined;
    return new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString().slice(0, 10);
  }

  const text = cleanLabel(value).replace(/\.$/, "");
  const dotted = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dotted) {
    const year = normalizeYear(Number(dotted[3]));
    return toIsoDate(year, Number(dotted[2]), Number(dotted[1]));
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const year = normalizeYear(Number(slash[3]));
    return toIsoDate(year, Number(slash[1]), Number(slash[2]));
  }

  const ruMonth = text.toLowerCase().match(/^(\d{1,2})\s+([а-яё]+)$/);
  if (ruMonth) {
    const month = russianMonthNumber(ruMonth[2]);
    if (!month) return undefined;
    const previous = previousDate ? new Date(previousDate) : new Date();
    let year = previous.getUTCFullYear();
    let candidate = toIsoDate(year, month, Number(ruMonth[1]));
    if (previousDate && new Date(candidate).getTime() + 1000 * 60 * 60 * 24 * 180 < new Date(previousDate).getTime()) {
      year += 1;
      candidate = toIsoDate(year, month, Number(ruMonth[1]));
    }
    return candidate;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function toIsoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function russianMonthNumber(month: string) {
  const months: Record<string, number> = {
    января: 1,
    февраль: 2,
    февраля: 2,
    март: 3,
    марта: 3,
    апрель: 4,
    апреля: 4,
    май: 5,
    мая: 5,
    июнь: 6,
    июня: 6,
    июль: 7,
    июля: 7,
    август: 8,
    августа: 8,
    сентябрь: 9,
    сентября: 9,
    октябрь: 10,
    октября: 10,
    ноябрь: 11,
    ноября: 11,
    декабрь: 12,
    декабря: 12,
  };
  return months[month];
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(left: Date, right: Date) {
  return Math.round((startOfDay(right).getTime() - startOfDay(left).getTime()) / (1000 * 60 * 60 * 24));
}

function stringValue(row: Record<string, unknown>, names: string[]) {
  const value = findValue(row, names);
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(row: Record<string, unknown>, names: string[]) {
  const value = findValue(row, names);
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(row: Record<string, unknown>, names: string[]) {
  const value = findValue(row, names);
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return undefined;
    return new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function findValue(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  const found = entries.find(([key]) => names.includes(cleanKey(key)));
  return found?.[1];
}

function cleanKey(key: string) {
  return key.toLowerCase().replace(/\s+/g, " ").trim();
}

function sum(rows: WorkItem[], key: keyof Pick<WorkItem, "planQty" | "factQty" | "shippedQty" | "defectQty">) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function ratio(value: number, base: number) {
  return base ? Math.round((value / base) * 1000) / 10 : 0;
}

function metric(name: string, left: number, right: number, suffix = "") {
  const delta = Math.round((right - left) * 10) / 10;
  return { name, left, right, delta, suffix };
}

function createClientId() {
  const browserCrypto = globalThis.crypto as Crypto | undefined;

  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  const random = browserCrypto?.getRandomValues
    ? Array.from(browserCrypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(36)).join("")
    : Math.random().toString(36).slice(2);

  return `id-${Date.now().toString(36)}-${random}`;
}
