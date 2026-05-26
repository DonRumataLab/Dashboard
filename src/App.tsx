import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Factory,
  FileSpreadsheet,
  GitCompareArrows,
  History,
  Milestone,
  PackageCheck,
  PanelsTopLeft,
  Settings,
  Truck,
  Trash2,
  Upload,
} from "lucide-react";
import type { ControlDateSnapshot, DashboardTab, PortfolioSnapshot, Snapshot, UploadHistoryRecord } from "./types";
import { deleteUploadFromServer, fetchServerState, uploadSnapshotToServer } from "./lib/api";
import {
  buildHistory,
  buildControlDateStatus,
  buildControlDateIntervals,
  buildControlDateIssues,
  buildControlTimeline,
  buildPortfolioProblemItems,
  buildPortfolioStageStats,
  calculateControlDateKpis,
  calculateKpis,
  calculatePortfolioKpis,
  compareSnapshots,
  getUpcomingControlMilestones,
  groupPortfolioByCollection,
  groupPortfolioByProductType,
  groupPortfolioByStatus,
  groupPortfolioBySupplier,
  groupByDepartment,
  groupByStatus,
  loadControlDateSnapshots,
  loadPortfolioSnapshots,
  loadSnapshots,
  parseControlDatesWorkbook,
  parsePortfolioWorkbook,
  parseWorkbook,
  saveControlDateSnapshots,
  savePortfolioSnapshots,
  saveSnapshots,
} from "./lib/data";

const tabs: Array<{ id: DashboardTab; label: string; icon: ElementType }> = [
  { id: "overview", label: "Обзор", icon: Factory },
  { id: "controlDates", label: "Контрольные даты", icon: Milestone },
  { id: "portfolio", label: "Портфель", icon: PanelsTopLeft },
  { id: "production", label: "Производство", icon: PackageCheck },
  { id: "logistics", label: "Логистика", icon: Truck },
  { id: "history", label: "История", icon: History },
  { id: "compare", label: "Сравнение", icon: GitCompareArrows },
  { id: "admin", label: "Загрузка", icon: Settings },
];

const colors = ["#255c5c", "#e0a13a", "#4e6b9f", "#8a5a44", "#7d8f45", "#b65353"];

export default function App() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(loadSnapshots);
  const [controlDateSnapshots, setControlDateSnapshots] = useState(loadControlDateSnapshots);
  const [portfolioSnapshots, setPortfolioSnapshots] = useState(loadPortfolioSnapshots);
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryRecord[]>([]);
  const [serverMode, setServerMode] = useState<"checking" | "online" | "offline">("checking");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [activeSnapshotId, setActiveSnapshotId] = useState(snapshots.at(-1)?.id ?? "");
  const [activeControlSnapshotId, setActiveControlSnapshotId] = useState(controlDateSnapshots.at(-1)?.id ?? "");
  const [activePortfolioSnapshotId, setActivePortfolioSnapshotId] = useState(portfolioSnapshots.at(-1)?.id ?? "");
  const [compareLeft, setCompareLeft] = useState(snapshots.at(0)?.id ?? "");
  const [compareRight, setCompareRight] = useState(snapshots.at(-1)?.id ?? "");
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10));
  const [uploadMessage, setUploadMessage] = useState("");

  const activeSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? snapshots.at(-1),
    [activeSnapshotId, snapshots],
  );
  const activeControlSnapshot = useMemo(
    () => controlDateSnapshots.find((snapshot) => snapshot.id === activeControlSnapshotId) ?? controlDateSnapshots.at(-1),
    [activeControlSnapshotId, controlDateSnapshots],
  );
  const activePortfolioSnapshot = useMemo(
    () => portfolioSnapshots.find((snapshot) => snapshot.id === activePortfolioSnapshotId) ?? portfolioSnapshots.at(-1),
    [activePortfolioSnapshotId, portfolioSnapshots],
  );
  const kpis = useMemo(() => calculateKpis(activeSnapshot?.rows ?? []), [activeSnapshot]);
  const controlKpis = useMemo(() => calculateControlDateKpis(activeControlSnapshot), [activeControlSnapshot]);
  const upcomingControlMilestones = useMemo(() => getUpcomingControlMilestones(activeControlSnapshot, 12), [activeControlSnapshot]);
  const controlStatus = useMemo(() => buildControlDateStatus(activeControlSnapshot), [activeControlSnapshot]);
  const controlTimeline = useMemo(() => buildControlTimeline(activeControlSnapshot), [activeControlSnapshot]);
  const controlIntervals = useMemo(() => buildControlDateIntervals(activeControlSnapshot), [activeControlSnapshot]);
  const controlIssues = useMemo(() => buildControlDateIssues(activeControlSnapshot), [activeControlSnapshot]);
  const portfolioKpis = useMemo(() => calculatePortfolioKpis(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const portfolioStatuses = useMemo(() => groupPortfolioByStatus(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const portfolioCollections = useMemo(() => groupPortfolioByCollection(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const portfolioSuppliers = useMemo(() => groupPortfolioBySupplier(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const portfolioTypes = useMemo(() => groupPortfolioByProductType(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const portfolioStages = useMemo(() => buildPortfolioStageStats(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const portfolioProblems = useMemo(() => buildPortfolioProblemItems(activePortfolioSnapshot), [activePortfolioSnapshot]);
  const departmentData = useMemo(() => groupByDepartment(activeSnapshot?.rows ?? []), [activeSnapshot]);
  const statusData = useMemo(() => groupByStatus(activeSnapshot?.rows ?? []), [activeSnapshot]);
  const history = useMemo(() => buildHistory(snapshots), [snapshots]);
  const comparison = useMemo(
    () => compareSnapshots(snapshots.find((item) => item.id === compareLeft), snapshots.find((item) => item.id === compareRight)),
    [compareLeft, compareRight, snapshots],
  );

  useEffect(() => {
    void refreshServerState();
  }, []);

  async function refreshServerState() {
    try {
      const state = await fetchServerState();
      if (!state) {
        setServerMode("offline");
        return;
      }

      const productionSnapshots = state.snapshots
        .filter((snapshot) => snapshot.dashboardType === "production")
        .map((snapshot) => snapshot.payload as Snapshot);
      const controlSnapshots = state.snapshots
        .filter((snapshot) => snapshot.dashboardType === "controlDates")
        .map((snapshot) => snapshot.payload as ControlDateSnapshot);
      const serverPortfolioSnapshots = state.snapshots
        .filter((snapshot) => snapshot.dashboardType === "portfolio")
        .map((snapshot) => snapshot.payload as PortfolioSnapshot);

      setSnapshots(productionSnapshots);
      setControlDateSnapshots(controlSnapshots);
      setPortfolioSnapshots(serverPortfolioSnapshots);
      setUploadHistory(state.uploads);
      setServerMode("online");

      if (!activeSnapshotId && productionSnapshots.length) setActiveSnapshotId(productionSnapshots.at(-1)!.id);
      if (!activeControlSnapshotId && controlSnapshots.length) setActiveControlSnapshotId(controlSnapshots.at(-1)!.id);
      if (!activePortfolioSnapshotId && serverPortfolioSnapshots.length) setActivePortfolioSnapshotId(serverPortfolioSnapshots.at(-1)!.id);
    } catch {
      setServerMode("offline");
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    try {
      const controlDateSnapshot = await parseControlDatesWorkbook(file, uploadDate);
      if (controlDateSnapshot) {
        const serverUpload = await tryPersistOnServer("controlDates", file, controlDateSnapshot);
        const nextControlDateSnapshots = [...controlDateSnapshots, controlDateSnapshot].sort(sortSnapshotsByDataDateAndUploadTime);
        setControlDateSnapshots(nextControlDateSnapshots);
        saveControlDateSnapshots(nextControlDateSnapshots);
        setActiveControlSnapshotId(controlDateSnapshot.id);
        setActiveTab("controlDates");
        setUploadMessage(
          `Загружен дашборд контрольных дат: ${controlDateSnapshot.rows.length} коллекций. ${serverUpload ? "История сохранена на сервере." : "Сервер недоступен, сохранено локально."}`,
        );
        return;
      }

      const portfolioSnapshot = await parsePortfolioWorkbook(file, uploadDate);
      if (portfolioSnapshot) {
        const serverUpload = await tryPersistOnServer("portfolio", file, portfolioSnapshot);
        const nextPortfolioSnapshots = [...portfolioSnapshots, portfolioSnapshot].sort(sortSnapshotsByDataDateAndUploadTime);
        setPortfolioSnapshots(nextPortfolioSnapshots);
        savePortfolioSnapshots(nextPortfolioSnapshots);
        setActivePortfolioSnapshotId(portfolioSnapshot.id);
        setActiveTab("portfolio");
        setUploadMessage(
          `Загружен производственный портфель: ${portfolioSnapshot.rows.length} позиций. ${serverUpload ? "История сохранена на сервере." : "Сервер недоступен, сохранено локально."}`,
        );
        return;
      }

      const snapshot = await parseWorkbook(file, uploadDate);
      const serverUpload = await tryPersistOnServer("production", file, snapshot);
      const next = [...snapshots, snapshot].sort(sortSnapshotsByDataDateAndUploadTime);
      setSnapshots(next);
      saveSnapshots(next);
      setActiveSnapshotId(snapshot.id);
      setCompareRight(snapshot.id);
      setUploadMessage(`Загружено строк: ${snapshot.rows.length}. ${serverUpload ? "История сохранена на сервере." : "Сервер недоступен, сохранено локально."}`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Не удалось разобрать файл.");
    }
  }

  async function tryPersistOnServer(dashboardType: "production" | "controlDates" | "portfolio", file: File, payload: Snapshot | ControlDateSnapshot | PortfolioSnapshot) {
    try {
      const upload = await uploadSnapshotToServer({ dashboardType, snapshotDate: uploadDate, file, payload });
      setServerMode("online");
      await refreshServerState();
      return upload;
    } catch {
      setServerMode("offline");
      return null;
    }
  }

  async function handleDeleteUpload(upload: UploadHistoryRecord) {
    const confirmed = window.confirm(`Удалить загрузку "${upload.originalName}" от ${formatDate(upload.snapshotDate)}?`);
    if (!confirmed) return;

    try {
      await deleteUploadFromServer(upload.id);
      await refreshServerState();
      setUploadMessage(`Удалена загрузка: ${upload.originalName}.`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Не удалось удалить загрузку.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">МР</div>
          <div>
            <strong>М-Ризен</strong>
            <span>Портал дашбордов</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Разделы портала">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>Внутренний BI-портал</p>
            <h1>Контроль производственного и логистического плана</h1>
          </div>
          <label className="date-select">
            <CalendarDays size={18} />
            <select
              value={activeTab === "controlDates" ? activeControlSnapshot?.id ?? "" : activeTab === "portfolio" ? activePortfolioSnapshot?.id ?? "" : activeSnapshot?.id ?? ""}
              onChange={(event) => {
                if (activeTab === "controlDates") setActiveControlSnapshotId(event.target.value);
                else if (activeTab === "portfolio") setActivePortfolioSnapshotId(event.target.value);
                else setActiveSnapshotId(event.target.value);
              }}
            >
              {(activeTab === "controlDates" ? controlDateSnapshots : activeTab === "portfolio" ? portfolioSnapshots : snapshots).map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {formatSnapshotOption(snapshot)}
                </option>
              ))}
            </select>
          </label>
        </header>

        {activeTab === "overview" && (
          <DashboardSection title="Обзор выполнения" subtitle={activeSnapshot?.sourceName}>
            <KpiGrid kpis={kpis} />
            <div className="chart-grid">
              <Panel title="План / факт по участкам">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="department" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="plan" name="План" fill="#255c5c" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="fact" name="Факт" fill="#e0a13a" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Статусы заказов">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={58} outerRadius={105} paddingAngle={3}>
                      {statusData.map((_, index) => (
                        <Cell key={index} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Panel>
            </div>
          </DashboardSection>
        )}

        {activeTab === "controlDates" && (
          <DashboardSection title="Контрольные даты импорт" subtitle={activeControlSnapshot?.sourceName ?? "Загрузите XLSX в разделе загрузки"}>
            <div className="control-kpi-grid">
              <article className="kpi-card">
                <span>Коллекции</span>
                <strong>{controlKpis.collections}</strong>
              </article>
              <article className="kpi-card">
                <span>Контрольные точки</span>
                <strong>{controlKpis.totalMilestones}</strong>
              </article>
              <article className="kpi-card">
                <span>Ближайшие 14 дней</span>
                <strong>{controlKpis.nextMilestones}</strong>
              </article>
              <article className="kpi-card">
                <span>Без даты</span>
                <strong>{controlKpis.emptyDates}</strong>
              </article>
            </div>
            <div className="chart-grid">
              <Panel title="Ближайшие контрольные точки">
                <div className="milestone-list">
                  {upcomingControlMilestones.length ? (
                    upcomingControlMilestones.map((item) => (
                      <div key={`${item.collection}-${item.name}-${item.date}`}>
                        <time>{formatDate(item.date)}</time>
                        <strong>{item.collection}</strong>
                        <span>{item.name}</span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">В загруженном снимке нет будущих дат.</p>
                  )}
                </div>
              </Panel>
              <Panel title="Готовность по коллекциям">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={controlStatus} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="collection" type="category" width={96} />
                    <Tooltip />
                    <Bar dataKey="progressPct" name="Пройдено этапов, %" fill="#255c5c" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>
            <Panel title="Календарный таймлайн по коллекциям">
              <ControlTimeline timeline={controlTimeline} />
            </Panel>
            <div className="chart-grid">
              <Panel title="Проблемы в датах">
                <div className="issue-list">
                  {controlIssues.length ? (
                    controlIssues.map((issue) => (
                      <div className={issue.severity} key={`${issue.collection}-${issue.type}-${issue.detail}`}>
                        <strong>{issue.collection}</strong>
                        <span>{issue.type}</span>
                        <small>{issue.detail}</small>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">Критичных аномалий в последовательности дат не найдено.</p>
                  )}
                </div>
              </Panel>
              <Panel title="Самые длинные интервалы">
                <div className="interval-list">
                  {controlIntervals.length ? (
                    controlIntervals.map((interval) => (
                      <div key={`${interval.collection}-${interval.from}-${interval.to}`}>
                        <strong>{interval.days} дн.</strong>
                        <span>{interval.collection}</span>
                        <small>
                          {interval.from} {"->"} {interval.to}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">Интервалы появятся после загрузки файла с датами.</p>
                  )}
                </div>
              </Panel>
            </div>
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Коллекция</th>
                    <th>Последняя точка</th>
                    <th>Следующая точка</th>
                    <th>Дата</th>
                    <th>Прогресс</th>
                  </tr>
                </thead>
                <tbody>
                  {controlStatus.map((row) => (
                    <tr key={row.collection}>
                      <td>{row.collection}</td>
                      <td>{row.previousName}</td>
                      <td>{row.nextName}</td>
                      <td>{row.nextDate ? formatDate(row.nextDate) : "—"}</td>
                      <td>
                        <Progress value={row.progressPct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardSection>
        )}

        {activeTab === "portfolio" && (
          <DashboardSection title="Производственный портфель" subtitle={activePortfolioSnapshot?.sourceName ?? "Загрузите XLSX с листом выгрузки производства"}>
            <div className="kpi-grid portfolio-kpis">
              <article className="kpi-card">
                <span>Позиции</span>
                <strong>{formatNumber(portfolioKpis.positions)}</strong>
              </article>
              <article className="kpi-card">
                <span>Заказ, шт</span>
                <strong>{formatNumber(portfolioKpis.qty)}</strong>
              </article>
              <article className="kpi-card">
                <span>Коллекции</span>
                <strong>{portfolioKpis.collections}</strong>
              </article>
              <article className="kpi-card">
                <span>Поставщики</span>
                <strong>{portfolioKpis.suppliers}</strong>
              </article>
              <article className="kpi-card">
                <span>Без статуса</span>
                <strong>{portfolioKpis.withoutStatus}</strong>
              </article>
              <article className="kpi-card">
                <span>Просрочки</span>
                <strong>{portfolioKpis.overdue}</strong>
              </article>
            </div>

            <div className="chart-grid">
              <Panel title="Статусы производства">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={portfolioStatuses} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip />
                    <Bar dataKey="count" name="Позиций" fill="#255c5c" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Коллекции">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={portfolioCollections}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" name="Позиций" fill="#4e6b9f" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="qty" name="Штук" fill="#e0a13a" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            <div className="chart-grid">
              <Panel title="Поставщики по объему">
                <div className="rank-list">
                  {portfolioSuppliers.map((item) => (
                    <div key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{formatNumber(item.count)} поз.</span>
                      <small>{formatNumber(item.qty)} шт</small>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Типы изделий">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={portfolioTypes} dataKey="count" nameKey="name" innerRadius={58} outerRadius={105} paddingAngle={3}>
                      {portfolioTypes.map((_, index) => (
                        <Cell key={index} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            <Panel title="Контроль этапов">
              <div className="table-panel embedded">
                <table>
                  <thead>
                    <tr>
                      <th>Этап</th>
                      <th>План</th>
                      <th>Факт</th>
                      <th>Просрочено без факта</th>
                      <th>Факт позже плана</th>
                      <th>Среднее опоздание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioStages.map((stage) => (
                      <tr key={stage.key}>
                        <td>{stage.name}</td>
                        <td>{stage.planned}</td>
                        <td>{stage.completed}</td>
                        <td>{stage.overdue}</td>
                        <td>{stage.late}</td>
                        <td>{stage.avgLateDays} дн.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Проблемные позиции">
              <div className="table-panel embedded">
                <table>
                  <thead>
                    <tr>
                      <th>Проблема</th>
                      <th>Дней</th>
                      <th>Индекс</th>
                      <th>Номенклатура</th>
                      <th>Коллекция</th>
                      <th>Тип</th>
                      <th>Поставщик</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioProblems.map((problem, index) => (
                      <tr key={`${problem.item.id}-${problem.issue}-${index}`}>
                        <td>{problem.issue}</td>
                        <td>{problem.daysLate ?? "—"}</td>
                        <td>{problem.item.index}</td>
                        <td>{problem.item.nomenclature}</td>
                        <td>{problem.item.collection}</td>
                        <td>{problem.item.productType}</td>
                        <td>{problem.item.supplier || "—"}</td>
                        <td>{problem.item.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </DashboardSection>
        )}

        {activeTab === "production" && (
          <DashboardSection title="Производственный план" subtitle="Выпуск, отставания и проблемные позиции">
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Заказ</th>
                    <th>Изделие</th>
                    <th>Участок</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>Выполнение</th>
                    <th>Срок</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeSnapshot?.rows ?? []).map((row) => (
                    <tr key={row.id}>
                      <td>{row.order}</td>
                      <td>{row.product}</td>
                      <td>{row.department}</td>
                      <td>{formatNumber(row.planQty)}</td>
                      <td>{formatNumber(row.factQty)}</td>
                      <td>
                        <Progress value={row.planQty ? (row.factQty / row.planQty) * 100 : 0} />
                      </td>
                      <td>{row.dueDate ? formatDate(row.dueDate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardSection>
        )}

        {activeTab === "logistics" && (
          <DashboardSection title="Логистический план" subtitle="Отгрузка относительно производственного плана">
            <div className="chart-grid">
              <Panel title="Отгрузка по участкам">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={departmentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="department" type="category" width={96} />
                    <Tooltip />
                    <Bar dataKey="shipped" name="Отгружено" fill="#4e6b9f" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Готовность к отгрузке">
                <div className="logistics-score">
                  <strong>{kpis.shipmentPct}%</strong>
                  <span>от плана уже отгружено</span>
                  <Progress value={kpis.shipmentPct} />
                </div>
              </Panel>
            </div>
          </DashboardSection>
        )}

        {activeTab === "history" && (
          <DashboardSection title="Исторические данные" subtitle="Динамика по всем загруженным датам">
            <Panel title="Выполнение и отгрузка во времени">
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="fact" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#e0a13a" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#e0a13a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area dataKey="factQty" name="Факт" stroke="#e0a13a" fill="url(#fact)" strokeWidth={2} />
                  <Area dataKey="shippedQty" name="Отгрузка" stroke="#4e6b9f" fill="#4e6b9f22" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </DashboardSection>
        )}

        {activeTab === "compare" && (
          <DashboardSection title="Сравнение снимков" subtitle="Сопоставление двух загруженных дат">
            <div className="compare-controls">
              <DateChoice label="Дата А" value={compareLeft} snapshots={snapshots} onChange={setCompareLeft} />
              <DateChoice label="Дата Б" value={compareRight} snapshots={snapshots} onChange={setCompareRight} />
            </div>
            <div className="compare-grid">
              {comparison.map((item) => (
                <div className="compare-card" key={item.name}>
                  <span>{item.name}</span>
                  <strong>
                    {formatNumber(item.left)}
                    {item.suffix} → {formatNumber(item.right)}
                    {item.suffix}
                  </strong>
                  <small className={item.delta >= 0 ? "positive" : "negative"}>
                    {item.delta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                    {item.delta > 0 ? "+" : ""}
                    {formatNumber(item.delta)}
                    {item.suffix}
                  </small>
                </div>
              ))}
            </div>
          </DashboardSection>
        )}

        {activeTab === "admin" && (
          <DashboardSection title="Админка загрузки" subtitle="Загрузка выгрузок из 1С в формате XLSX">
            <div className="admin-layout">
              <label className="upload-zone">
                <Upload size={32} />
                <strong>Выберите XLSX-файл</strong>
                <span>Первая строка должна содержать названия колонок</span>
                <input type="file" accept=".xlsx,.xls" onChange={(event) => void handleUpload(event.target.files?.[0])} />
              </label>
              <div className="admin-card">
                <div className={`server-status ${serverMode}`}>
                  <span />
                  {serverMode === "online" ? "Серверная БД подключена" : serverMode === "checking" ? "Проверяем серверную БД" : "Серверная БД недоступна"}
                </div>
                <label>
                  Дата, на которую в файле есть данные
                  <input type="date" value={uploadDate} onChange={(event) => setUploadDate(event.target.value)} />
                </label>
                <p>{uploadMessage || "После загрузки файл появится в истории, а дашборды можно будет открыть на выбранную дату."}</p>
              </div>
            </div>
            <Panel title="Загруженные снимки">
              <div className="snapshot-list">
                {controlDateSnapshots.map((snapshot) => (
                  <div key={snapshot.id}>
                    <Milestone size={18} />
                    <strong>{formatDate(snapshot.date)}</strong>
                    <span>{snapshot.sourceName}</span>
                    <small>{snapshot.rows.length} колл.</small>
                  </div>
                ))}
                {snapshots.map((snapshot) => (
                  <div key={snapshot.id}>
                    <FileSpreadsheet size={18} />
                    <strong>{formatDate(snapshot.date)}</strong>
                    <span>{snapshot.sourceName}</span>
                    <small>{snapshot.rows.length} строк</small>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="История загрузок">
              <UploadHistoryTable uploads={uploadHistory} onDelete={handleDeleteUpload} />
            </Panel>
          </DashboardSection>
        )}
      </section>
    </main>
  );
}

function UploadHistoryTable({ uploads, onDelete }: { uploads: UploadHistoryRecord[]; onDelete: (upload: UploadHistoryRecord) => void }) {
  if (!uploads.length) {
    return <p className="empty-state">История серверных загрузок появится после первого сохранения в БД.</p>;
  }

  return (
    <div className="table-panel embedded">
      <table>
        <thead>
          <tr>
            <th>Тип</th>
            <th>Файл</th>
            <th>Дата данных</th>
            <th>Дата загрузки</th>
            <th>Время загрузки</th>
            <th>IP</th>
            <th>Строк</th>
            <th>Размер</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((upload) => (
            <tr key={upload.id}>
              <td>{formatDashboardType(upload.dashboardType)}</td>
              <td>{upload.originalName}</td>
              <td>{formatDate(upload.snapshotDate)}</td>
              <td>{formatDate(upload.uploadedAt)}</td>
              <td>{formatTime(upload.uploadedAt)}</td>
              <td>{upload.uploaderIp}</td>
              <td>{upload.rowCount}</td>
              <td>{formatFileSize(upload.fileSize)}</td>
              <td>
                <button className="icon-danger" type="button" onClick={() => onDelete(upload)} title="Удалить загрузку">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function KpiGrid({ kpis }: { kpis: ReturnType<typeof calculateKpis> }) {
  const cards = [
    ["План", kpis.planQty, "шт"],
    ["Факт", kpis.factQty, "шт"],
    ["Выполнение", kpis.completionPct, "%"],
    ["Отгрузка", kpis.shipmentPct, "%"],
    ["Брак", kpis.defectPct, "%"],
    ["Заказы", kpis.activeOrders, ""],
  ];
  return (
    <div className="kpi-grid">
      {cards.map(([label, value, suffix]) => (
        <article className="kpi-card" key={label}>
          <span>{label}</span>
          <strong>
            {formatNumber(Number(value))}
            {suffix}
          </strong>
        </article>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function ControlTimeline({ timeline }: { timeline: ReturnType<typeof buildControlTimeline> }) {
  if (!timeline.rows.length) {
    return <p className="empty-state">Загрузите файл контрольных дат, чтобы увидеть таймлайн.</p>;
  }

  return (
    <div className="timeline">
      <div className="timeline-axis">
        <span>{formatDate(timeline.startDate)}</span>
        <span>{formatDate(timeline.endDate)}</span>
      </div>
      <div className="timeline-rows">
        {timeline.rows.map((row) => (
          <div className="timeline-row" key={row.collection}>
            <strong>{row.collection}</strong>
            <div className="timeline-track">
              {row.milestones.map((milestone) => (
                <span
                  className="timeline-dot"
                  key={`${row.collection}-${milestone.name}-${milestone.date}`}
                  style={{ left: `${milestone.offsetPct}%` }}
                  title={`${milestone.name}: ${formatDate(milestone.date)}`}
                />
              ))}
            </div>
            <small>
              {formatDate(row.startDate)} {"->"} {formatDate(row.endDate)}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" aria-label={`Выполнение ${Math.round(safeValue)}%`}>
      <span style={{ width: `${safeValue}%` }} />
      <em>{Math.round(safeValue)}%</em>
    </div>
  );
}

function DateChoice({ label, value, snapshots, onChange }: { label: string; value: string; snapshots: Snapshot[]; onChange: (value: string) => void }) {
  return (
    <label className="date-choice">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {formatSnapshotOption(snapshot)}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function formatTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} КБ`;
  return `${Math.round(value / 1024 / 102.4) / 10} МБ`;
}

function formatDashboardType(type: UploadHistoryRecord["dashboardType"]) {
  if (type === "controlDates") return "Контрольные даты";
  if (type === "portfolio") return "Портфель";
  return "Производство";
}

function formatSnapshotOption(snapshot: Pick<Snapshot | ControlDateSnapshot, "date" | "sourceName" | "uploadedAt">) {
  return `${formatDate(snapshot.date)} | ${snapshot.sourceName} | ${formatTime(snapshot.uploadedAt)}`;
}

function sortSnapshotsByDataDateAndUploadTime<T extends Pick<Snapshot | ControlDateSnapshot, "date" | "uploadedAt">>(left: T, right: T) {
  return left.date.localeCompare(right.date) || left.uploadedAt.localeCompare(right.uploadedAt);
}
