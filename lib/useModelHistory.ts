import { useEffect, useRef, useState } from "react";
import { cleanWorkspace, type Workspace } from "./modelLibrary";
export function useModelHistory(
  workspace: Workspace,
  replace: (w: Workspace) => void,
) {
  const current = cleanWorkspace(workspace),
    key = JSON.stringify(current);
  const previous = useRef(current),
    past = useRef<Workspace[]>([]),
    future = useRef<Workspace[]>([]),
    restoring = useRef(false);
  const [, bump] = useState(0);
  const dragging = workspace.nodes.some((n) => n.dragging);
  useEffect(() => {
    if (dragging) return;
    if (JSON.stringify(previous.current) === key) return;
    if (restoring.current) {
      restoring.current = false;
    } else {
      past.current = [...past.current.slice(-99), previous.current];
      future.current = [];
    }
    previous.current = current;
    bump((v) => v + 1);
  }, [key, dragging]);
  const undo = () => {
    const target = past.current.pop();
    if (!target) return;
    future.current.push(current);
    restoring.current = true;
    replace(structuredClone(target));
    bump((v) => v + 1);
  };
  const redo = () => {
    const target = future.current.pop();
    if (!target) return;
    past.current.push(current);
    restoring.current = true;
    replace(structuredClone(target));
    bump((v) => v + 1);
  };
  return {
    reset: () => {
      past.current = [];
      future.current = [];
      restoring.current = true;
      previous.current = cleanWorkspace(workspace);
      bump((v) => v + 1);
    },
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
