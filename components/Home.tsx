import { useRef, useState } from 'react';
import { ArrowRight, BookOpen, FlaskConical, Trophy, Activity, Workflow, Network, Trash2, Settings2 } from 'lucide-react';
import type { TabId } from '../App';
import { LESSONS, EXAMPLES, CHALLENGES } from '../lib/theoryContent';

interface HomeProps {
  onNavigate: (tab: TabId) => void;
  onClearData: () => void;
}

const destinations = [
  { id: 'theory', label: 'Lessons', icon: BookOpen, description: 'Build your foundation in events, queues and simulation.', detail: `${LESSONS.length} guided lessons` },
  { id: 'examples', label: 'Examples', icon: FlaskConical, description: 'Explore ready-to-run models and see theory in action.', detail: `${EXAMPLES.length} worked models` },
  { id: 'challenges', label: 'Challenges', icon: Trophy, description: 'Test your understanding with hints and explanations.', detail: `${CHALLENGES.length} practice problems` },
] as const;

export default function Home({ onNavigate, onClearData }: HomeProps) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  const clearData = () => {
    try {
      onClearData();
      setError('');
      setNotice('All app data cleared. Your starter model and default preferences have been restored.');
      dialog.current?.close();
    } catch {
      setError('Browser storage could not be cleared. Check your browser’s storage permissions and try again.');
    }
  };

  return (
    <div className="home-page">
      <section className="home-intro">
        <span className="home-eyebrow">DES Playground</span>
        <h1>Learn it. Model it. Run it.</h1>
        <p>Your starting point for discrete event simulation. Explore the concepts, experiment with a model, and put your understanding to the test.</p>
      </section>

<section aria-labelledby="home-learn">
        <div className="home-section-heading"><h2 id="home-learn">Learn</h2><p>From the fundamentals to hands-on practice.</p></div>
        <div className="home-learn-grid">
          {destinations.map(({ id, label, icon: Icon, description, detail }) => (
            <button className="home-destination ui-card" key={id} onClick={() => onNavigate(id)}>
              <span className="home-card-icon"><Icon size={21} /></span>
              <h3>{label}</h3><p>{description}</p>
              <span className="home-card-link">{detail}<ArrowRight size={16} /></span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="home-workspace">
        <div className="home-section-heading"><h2 id="home-workspace">Workspace</h2><p>Experiment, compare and build your own simulations.</p></div>
        <div className="home-workspace-grid">
          <button className="home-workspace-card ui-card" onClick={() => onNavigate('playground')}>
            <span className="home-card-icon"><Activity size={21} /></span>
            <span><strong>M/M/c Modeler</strong><span>Adjust arrivals and service rates. Watch queues change live.</span></span><ArrowRight size={18} />
          </button>
          <button className="home-workspace-card ui-card" onClick={() => onNavigate('editor')}>
            <span className="home-card-icon"><Network size={21} /></span>
            <span><strong>Queue Modeler</strong><span>Build models, run experiments and export Python or R code.</span></span><ArrowRight size={18} />
          </button>
          <button className="home-workspace-card ui-card" onClick={() => onNavigate('des')}>
            <span className="home-card-icon"><Workflow size={21} /></span>
            <span><strong>Process Modeler</strong><span>Build processes with inventory, shared resources, decisions and cycles.</span></span><ArrowRight size={18} />
          </button>
        </div>
      </section>

      <section className="home-options ui-card" aria-labelledby="home-options">
        <div className="home-section-heading"><h2 id="home-options"><Settings2 size={18} /> Options &amp; data</h2><p>Make the playground yours, or start fresh.</p></div>
        <div className="home-option-row home-data-row">
          <div><strong>Clear all data</strong><span>Reset challenge progress, the autosaved process model and app preferences.</span><small>The Process Modeler autosaves in this browser. Queue models and simulation results last for the current session; downloaded JSON and CSV files are kept.</small></div>
          <button className="ui-btn ui-btn--danger" onClick={() => { setError(''); dialog.current?.showModal(); }}><Trash2 size={15} /> Clear all data</button>
        </div>
        {notice && <p className="home-notice" role="status">{notice}</p>}
      </section>

      <dialog className="home-reset-dialog" ref={dialog} aria-labelledby="reset-title" aria-describedby="reset-description">
        <h2 id="reset-title">Clear all app data?</h2>
        <p id="reset-description">This will erase the autosaved process model, completed challenges and preferences, and restore the starter models. This cannot be undone. Downloaded files are kept.</p>
        {error && <p role="alert" className="home-error">{error}</p>}
        <div className="home-dialog-actions">
          <button className="ui-btn" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="ui-btn ui-btn--danger" onClick={clearData}><Trash2 size={15} /> Clear all data</button>
        </div>
      </dialog>
    </div>
  );
}
