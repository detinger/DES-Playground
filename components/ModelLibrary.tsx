import React, { useEffect, useRef, useState } from "react";
import {
  cleanWorkspace,
  documentWorkspace,
  parseModelDocument,
  readLibrary,
  saveModel,
  workspaceDocument,
  type Workspace,
  type SavedModel,
} from "../lib/modelLibrary";
export default function ModelLibrary({
  workspace,
  replace,
  rename,
}: {
  workspace: Workspace;
  replace: (w: Workspace) => void;
  rename: (name: string) => void;
}) {
  const [models, setModels] = useState<SavedModel[]>([]),
    [selected, setSelected] = useState(""),
    [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => {
    try {
      setModels(readLibrary());
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  useEffect(refresh, []);
  const download = () => {
    try {
      const doc = parseModelDocument(
        JSON.stringify(workspaceDocument(workspace)),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (workspace.name.replace(/[^a-z0-9_-]+/gi, "_") || "model") +
        ".des.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setNotice(`Export failed: ${(e as Error).message}`);
    }
  };
  return (
    <div className="des-library">
      <div className="des-actions">
        <label className="des-field">
          Model name
          <input
            value={workspace.name}
            onChange={(e) => rename(e.target.value)}
          />
        </label>
        <button
          className="ui-btn"
          onClick={() => {
            try {
              const doc = workspaceDocument(workspace);
              saveModel(doc);
              refresh();
              setSelected(doc.id);
              setNotice("Saved a new copy in this browser.");
            } catch (e) {
              setNotice(
                `Save failed: ${(e as Error).message}. Export JSON to keep a file copy.`,
              );
            }
          }}
        >
          Save new copy
        </button>
        <label className="des-field">
          Saved models
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a saved model</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.model.name} · {new Date(m.updatedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <button
          className="ui-btn"
          disabled={!selected}
          onClick={() => {
            const doc = models.find((m) => m.id === selected);
            if (doc) {
              replace(documentWorkspace(doc));
              setNotice(
                "Loaded saved model. Undo restores your previous workspace.",
              );
            }
          }}
        >
          Load model
        </button>
        <button
          className="ui-btn"
          disabled={!selected}
          onClick={() => {
            try {
              saveModel(workspaceDocument(workspace, selected));
              refresh();
              setNotice("Updated selected saved model.");
            } catch (e) {
              setNotice(`Save failed: ${(e as Error).message}`);
            }
          }}
        >
          Update saved model
        </button>
        <button className="ui-btn" onClick={download}>
          Export model JSON
        </button>
        <button className="ui-btn" onClick={() => file.current?.click()}>
          Import model JSON
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="Import model file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 5_000_000)
                throw new Error("Model files must be smaller than 5 MB.");
              replace(documentWorkspace(parseModelDocument(await f.text())));
              setNotice(
                "Imported model. Save a copy to add it to your library.",
              );
            } catch (err) {
              setNotice(`Import failed: ${(err as Error).message}`);
            }
            e.target.value = "";
          }}
        />
      </div>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
