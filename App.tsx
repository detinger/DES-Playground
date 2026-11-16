import React, { useState, useEffect, useCallback } from 'react';
import Simulator from './components/Simulator';
import Editor from './components/Editor';
import Theory from './components/Theory';
import {
  Activity,
  LayoutDashboard,
  Share2,
  BookOpen,
  Trophy,
  FlaskConical,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from './types';
import { RunConfig } from './lib/engine';

type TabId = 'theory' | 'examples' | 'challenges' | 'playground' | 'editor';
type Theme = 'light' | 'dark';

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
      className={`nav-item${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-icon">{icon}</span>
      {!collapsed && <span className="nav-label">{label}</span>}
    </button>
  );
}

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'theory',     label: 'Lessons',           icon: <BookOpen size={18} /> },
  { id: 'examples',   label: 'Examples',          icon: <FlaskConical size={18} /> },
  { id: 'challenges', label: 'Challenges',        icon: <Trophy size={18} /> },
  { id: 'playground', label: 'M/M/c Visualizer',  icon: <LayoutDashboard size={18} /> },
  { id: 'editor',     label: 'Model Explorer',    icon: <Share2 size={18} /> },
];

const TAB_TITLES: Record<TabId, { title: string; subtitle: string }> = {
  theory:     { title: 'Lessons',          subtitle: 'DES concepts and queueing fundamentals' },
  examples:   { title: 'Examples',         subtitle: '5 pre-built models illustrating key queueing concepts' },
  challenges: { title: 'Challenges',       subtitle: 'Test your DES knowledge — 5 assessed problems' },
  playground: { title: 'M/M/c Visualizer', subtitle: 'Interactive simulation with live charts' },
  editor:     { title: 'Model Explorer',   subtitle: 'Build, run and export DES models' },
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('theory');
  const [theme, setTheme] = useState<Theme>('light');
  const [collapsed, setCollapsed] = useState(false);

  const [nodes, setNodes] = useState<Node<NodeData>[]>([
    {
      id: '1',
      type: 'source',
      position: { x: 100, y: 150 },
      data: {
        label: 'Arrivals',
        type: 'source',
        distribution: { type: 'exponential', mean: 5 },
      },
    },
    {
      id: '2',
      type: 'server',
      position: { x: 400, y: 150 },
      data: {
        label: 'Process 1',
        type: 'server',
        capacity: 1,
        distribution: { type: 'exponential', mean: 4 },
      },
    },
    {
      id: '3',
      type: 'sink',
      position: { x: 700, y: 150 },
      data: {
        label: 'Departures',
        type: 'sink',
      },
    },
  ]);

  const [edges, setEdges] = useState<Edge[]>([
    { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
    { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
  ]);
  const [exampleConfig, setExampleConfig] = useState<Partial<RunConfig> | undefined>(undefined);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleLoadExample = useCallback((
    exNodes: Node<NodeData>[],
    exEdges: Edge[],
    cfg?: Partial<RunConfig>,
  ) => {
    setNodes(exNodes);
    setEdges(exEdges);
    if (cfg) setExampleConfig({ ...cfg }); // new object reference always re-triggers Editor effect
    setActiveTab('editor');
  }, []);

  const { title, subtitle } = TAB_TITLES[activeTab];

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Sidebar */}
      <aside className={`app-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">
            <Activity size={16} style={{ color: 'var(--text-on-primary)' }} />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div className="sidebar-brand-name">DES Playground</div>
              <div className="sidebar-brand-sub">Discrete Event Simulation</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Pages">
          {!collapsed && (
            <div className="sidebar-group-label">Workspace</div>
          )}
          {NAV_ITEMS.map(item => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.id}
              collapsed={collapsed}
              onClick={() => setActiveTab(item.id)}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="nav-item"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ justifyContent: collapsed ? 'center' : undefined }}
          >
            <span className="nav-icon">
              {collapsed
                ? <PanelLeftOpen size={18} />
                : <PanelLeftClose size={18} />}
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

          <button
            className="icon-btn"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <main className="app-content" id="main-content">
          {(activeTab === 'theory' || activeTab === 'examples' || activeTab === 'challenges') && (
            <Theory
              key={activeTab}
              onLoadExample={handleLoadExample}
              initialSection={
                activeTab === 'challenges' ? 'challenges'
                : activeTab === 'examples'  ? 'examples'
                : 'lessons'
              }
            />
          )}
          {activeTab === 'playground' && <Simulator />}
          {activeTab === 'editor'     && (
            <Editor
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
