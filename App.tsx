import {
  readAutosave,
  writeAutosave,
  type Workspace,
} from "./lib/modelLibrary";
import { useModelHistory } from "./lib/useModelHistory";
import DESModeler from "./components/DESModeler";
import { INVENTORY_NODES, INVENTORY_EDGES } from "./lib/processExamples";
import { EXAMPLES, CHALLENGES } from "./lib/theoryContent";
import React, { useState, useEffect, useCallback } from "react";
import Simulator from "./components/Simulator";
import Editor from "./components/Editor";
import Theory from "./components/Theory";
import Home from "./components/Home";
import { clearAppData, readPreference, savePreference } from "./lib/appStorage";
import {
  House,
  LayoutDashboard,
  Share2,
  BookOpen,
  Trophy,
  FlaskConical,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./types";
import { RunConfig } from "./lib/engine";

export type TabId =
  | "home"
  | "theory"
  | "examples"
  | "challenges"
  | "playground"
  | "editor"
  | "des";
type Theme = "light" | "dark";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, collapsed, onClick }: NavItemProps) {
  return (
    <button
      className={`nav-item${active ? " is-active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-icon">{icon}</span>
      {!collapsed && <span className="nav-label">{label}</span>}
    </button>
  );
}

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "theory", label: "Lessons", icon: <BookOpen size={18} /> },
  { id: "examples", label: "Examples", icon: <FlaskConical size={18} /> },
  { id: "challenges", label: "Challenges", icon: <Trophy size={18} /> },
  {
    id: "playground",
    label: "M/M/c Visualizer",
    icon: <LayoutDashboard size={18} />,
  },
  { id: "editor", label: "Queue Modeler", icon: <Share2 size={18} /> },
  { id: "des", label: "DES Modeler", icon: <Share2 size={18} /> },
];

const TAB_TITLES: Record<TabId, { title: string; subtitle: string }> = {
  home: { title: "Home", subtitle: "Overview, quick starts and preferences" },
  theory: {
    title: "Lessons",
    subtitle: "DES concepts and queueing fundamentals",
  },
  examples: {
    title: "Examples",
    subtitle: `${EXAMPLES.length} models and case studies to explore`,
  },
  challenges: {
    title: "Challenges",
    subtitle: `Test your DES knowledge — ${CHALLENGES.length} assessed problems`,
  },
  playground: {
    title: "M/M/c Visualizer",
    subtitle: "Interactive simulation with live charts",
  },
  des: {
    title: "DES Modeler",
    subtitle: "Model processes, resources, inventory and repeating cycles",
  },
  editor: {
    title: "Queue Modeler",
    subtitle: "Build and explore queueing networks",
  },
};

const INITIAL_NODES: React.ComponentProps<typeof Editor>["nodes"] = [
  {
    id: "1",
    type: "source",
    position: { x: 100, y: 150 },
    data: {
      label: "Arrivals",
      type: "source",
      distribution: { type: "exponential", mean: 5 },
    },
  },
  {
    id: "2",
    type: "server",
    position: { x: 400, y: 150 },
    data: {
      label: "Process 1",
      type: "server",
      capacity: 1,
      distribution: { type: "exponential", mean: 4 },
    },
  },
  {
    id: "3",
    type: "sink",
    position: { x: 700, y: 150 },
    data: {
      label: "Departures",
      type: "sink",
    },
  },
];

const INITIAL_EDGES: Edge[] = [
  {
    id: "e1-2",
    source: "1",
    target: "2",
    animated: true,
    style: { stroke: "var(--primary)", strokeWidth: 2 },
  },
  {
    id: "e2-3",
    source: "2",
    target: "3",
    animated: true,
    style: { stroke: "var(--primary)", strokeWidth: 2 },
  },
];

function App() {
  const [editorActionsElement, setEditorActionsElement] =
    useState<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [theme, setTheme] = useState<Theme>(() =>
    readPreference("des-theme") === "dark" ? "dark" : "light",
  );
  const [collapsed, setCollapsed] = useState(
    () => readPreference("des-sidebar-collapsed") === "true",
  );
  const [highlightedExampleId, setHighlightedExampleId] = useState<
    string | null
  >(null);

  const [nodes, setNodes] = useState<Node<NodeData>[]>(() =>
    structuredClone(INITIAL_NODES),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    structuredClone(INITIAL_EDGES),
  );
  const [restored] = useState(readAutosave);
  const [desName, setDesName] = useState(restored?.name ?? "Inventory");
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [desNodes, setDesNodes] = useState<Node<NodeData>[]>(
    () => restored?.nodes ?? structuredClone(INVENTORY_NODES),
  );
  const [desEdges, setDesEdges] = useState<Edge[]>(
    () => restored?.edges ?? structuredClone(INVENTORY_EDGES),
  );
  const [desConfig, setDesConfig] = useState<Partial<RunConfig>>(
    restored?.config ?? {
      horizon: 35,
      warmup: 0,
      seed: 3,
      replications: 1,
      unit: "day",
      stopMode: "horizon",
    },
  );
  const [exampleConfig, setExampleConfig] = useState<
    Partial<RunConfig> | undefined
  >(undefined);

  const desWorkspace: Workspace = {
    name: desName,
    nodes: desNodes,
    edges: desEdges,
    config: desConfig,
  };
  const replaceDes = (w: Workspace) => {
    setDesName(w.name);
    setDesNodes(w.nodes);
    setDesEdges(w.edges);
    setDesConfig(w.config);
  };
  const desHistory = useModelHistory(desWorkspace, replaceDes);
  useEffect(() => {
    try {
      writeAutosave(desWorkspace);
      setAutosaveStatus("Workspace autosaved in this browser.");
    } catch {
      setAutosaveStatus(
        "Autosave paused: check numeric settings or browser storage. Save or export after correcting the settings.",
      );
    }
  }, [desName, desNodes, desEdges, desConfig]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const navigate = (tab: TabId) => {
    setHighlightedExampleId(null);
    setActiveTab(tab);
  };

  const changeTheme = (value: Theme) => {
    setTheme(value);
    savePreference("des-theme", value);
  };

  const changeCollapsed = (value: boolean) => {
    setCollapsed(value);
    savePreference("des-sidebar-collapsed", String(value));
  };

  const handleClearData = () => {
    clearAppData();
    desHistory.reset();
    setDesName("Inventory");
    setNodes(structuredClone(INITIAL_NODES));
    setEdges(structuredClone(INITIAL_EDGES));
    setExampleConfig(undefined);
    setDesNodes(structuredClone(INVENTORY_NODES));
    setDesEdges(structuredClone(INVENTORY_EDGES));
    setDesConfig({
      horizon: 35,
      warmup: 0,
      seed: 3,
      replications: 1,
      unit: "day",
      stopMode: "horizon",
    });
    setHighlightedExampleId(null);
    setTheme("light");
    setCollapsed(false);
  };

  const handleLoadExample = useCallback(
    (exNodes: Node<NodeData>[], exEdges: Edge[], cfg?: Partial<RunConfig>) => {
      if (
        exNodes.some((n) => !["source", "server", "sink"].includes(n.data.type))
      ) {
        setDesName(cfg?.unit === "hour" ? "Factory" : "Inventory");
        setDesNodes(exNodes);
        setDesEdges(exEdges);
        setDesConfig(cfg ?? {});
        setActiveTab("des");
        return;
      }
      setNodes(exNodes);
      setEdges(exEdges);
      setExampleConfig(cfg ? { ...cfg } : undefined);
      setActiveTab("editor");
    },
    [],
  );

  const { title, subtitle } = TAB_TITLES[activeTab];

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Sidebar */}
      <aside
        className={`app-sidebar${collapsed ? " is-collapsed" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">
            <img src="/favicon.svg" width={30} height={30} alt="" />
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <div className="sidebar-brand-name">DES Playground</div>
              <div className="sidebar-brand-sub">Discrete Event Simulation</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Pages">
          <NavItem
            icon={<House size={18} />}
            label="Home"
            active={activeTab === "home"}
            collapsed={collapsed}
            onClick={() => navigate("home")}
          />
          {[
            { label: "Learn", items: NAV_ITEMS.slice(0, 3) },
            { label: "Workspace", items: NAV_ITEMS.slice(3) },
          ].map((group) => (
            <div
              className="sidebar-group"
              role="group"
              aria-label={group.label}
              key={group.label}
            >
              {!collapsed && (
                <div className="sidebar-group-label">{group.label}</div>
              )}
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={activeTab === item.id}
                  collapsed={collapsed}
                  onClick={() => navigate(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="nav-item"
            onClick={() => changeCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ justifyContent: collapsed ? "center" : undefined }}
          >
            <span className="nav-icon">
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </span>
            {!collapsed && <span className="nav-label">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="app-main">
        <div className="app-toolbar">
          <div>
            <div className="toolbar-title">{title}</div>
            <div className="toolbar-subtitle">{subtitle}</div>
          </div>

          <div className="toolbar-actions" ref={setEditorActionsElement}>
            {activeTab !== "editor" && (
              <button
                className="icon-btn"
                onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}
                title={
                  theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                aria-label={
                  theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}
          </div>
        </div>

        <main className="app-content" id="main-content" key={activeTab}>
          {activeTab === "home" && (
            <Home
              onNavigate={navigate}
              nodeCount={nodes.length}
              edgeCount={edges.length}
              theme={theme}
              onThemeChange={changeTheme}
              collapsed={collapsed}
              onCollapsedChange={changeCollapsed}
              onClearData={handleClearData}
            />
          )}
          {(activeTab === "theory" ||
            activeTab === "examples" ||
            activeTab === "challenges") && (
            <Theory
              key={activeTab}
              onLoadExample={handleLoadExample}
              highlightedExampleId={highlightedExampleId}
              onGoToExample={(id) => {
                setHighlightedExampleId(id);
                setActiveTab("examples");
              }}
              section={
                activeTab === "challenges"
                  ? "challenges"
                  : activeTab === "examples"
                    ? "examples"
                    : "lessons"
              }
            />
          )}
          {activeTab === "playground" && (
            <Simulator headerActionsElement={editorActionsElement} />
          )}
          {activeTab === "des" && (
            <DESModeler
              name={desName}
              setName={setDesName}
              history={desHistory}
              autosaveStatus={autosaveStatus}
              nodes={desNodes}
              setNodes={setDesNodes}
              edges={desEdges}
              setEdges={setDesEdges}
              config={desConfig}
              setConfig={setDesConfig}
            />
          )}
          {activeTab === "editor" && (
            <Editor
              headerActionsElement={editorActionsElement}
              nodes={nodes}
              setNodes={setNodes}
              edges={edges}
              setEdges={setEdges}
              exampleConfig={exampleConfig}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
