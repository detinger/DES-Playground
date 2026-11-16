import { assertModelShape } from "./modelShape";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../types";
import { SCHEMA_VERSION, type DesModel } from "./model";
import { DEFAULT_RUN_CONFIG, type RunConfig } from "./engine";
import { compileModel } from "./compiler";
import { validateProcessModel } from "./processValidation";

export interface Workspace {
  name: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  config: Partial<RunConfig>;
}
export interface SavedModel {
  format: "des-playground";
  version: 1;
  id: string;
  updatedAt: string;
  model: DesModel;
  config: RunConfig;
}
export const MODEL_LIBRARY_KEY = "des-model-library";
export const AUTOSAVE_KEY = "des-model-autosave";
export function cleanWorkspace(w: Workspace): Workspace {
  return {
    name: w.name,
    nodes: w.nodes.map(({ id, type, position, data }) => {
      const { simState, simActive, ...config } = data;
      return { id, type, position: { ...position }, data: config as NodeData };
    }),
    edges: w.edges.map(
      ({ id, source, target, sourceHandle, targetHandle, label, style }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        label,
        style,
      }),
    ),
    config: { ...w.config },
  };
}
export function workspaceDocument(
  w: Workspace,
  id: string = crypto.randomUUID(),
): SavedModel {
  const clean = cleanWorkspace(w);
  return {
    format: "des-playground",
    version: 1,
    id,
    updatedAt: new Date().toISOString(),
    model: compileModel(clean.nodes, clean.edges, {
      name: clean.name || "Untitled model",
      unit: clean.config.unit,
      modelId: id,
    }),
    config: {
      ...DEFAULT_RUN_CONFIG,
      unit: "minute",
      stopMode: "horizon",
      ...clean.config,
    },
  };
}
export function parseModelDocument(text: string): SavedModel {
  if (text.length > 5_000_000)
    throw new Error("Model files must be smaller than 5 MB.");
  const doc = JSON.parse(text);
  if (
    doc?.format !== "des-playground" ||
    doc.version !== 1 ||
    !doc.model ||
    ![2, 3].includes(doc.model.schemaVersion) ||
    !Array.isArray(doc.model.nodes) ||
    !Array.isArray(doc.model.edges) ||
    doc.model.nodes.length > 1000 ||
    doc.model.edges.length > 5000
  )
    throw new Error("Unsupported or malformed DES model file.");
  if (
    typeof doc.model.name !== "string" ||
    !["second", "minute", "hour", "day"].includes(doc.model.unit)
  )
    throw new Error("The model needs a name and a valid time unit.");
  for (const n of doc.model.nodes)
    if (
      typeof n.id !== "string" ||
      !n.id ||
      typeof n.name !== "string" ||
      !n.config ||
      !n.position ||
      ![n.position.x, n.position.y].every(Number.isFinite)
    )
      throw new Error("A model block is malformed.");
  for (const e of doc.model.edges)
    if (
      typeof e.id !== "string" ||
      typeof e.sourceId !== "string" ||
      typeof e.targetId !== "string" ||
      !["entityFlow", "store", "resource"].includes(e.kind)
    )
      throw new Error("A model connection is malformed.");
  const cfg = {
    ...DEFAULT_RUN_CONFIG,
    stopMode: "horizon",
    ...doc.config,
    unit: doc.model.unit,
  };
  if (
    !Number.isFinite(cfg.horizon) ||
    cfg.horizon <= 0 ||
    !Number.isFinite(cfg.warmup) ||
    cfg.warmup < 0 ||
    cfg.warmup >= cfg.horizon ||
    !Number.isInteger(cfg.seed) ||
    cfg.seed < 0 ||
    cfg.seed > 4294967295 ||
    !Number.isInteger(cfg.replications) ||
    cfg.replications < 1 ||
    cfg.replications > 100 ||
    !Number.isInteger(cfg.maxEvents) ||
    cfg.maxEvents < 1 ||
    cfg.maxEvents > 1_000_000 ||
    !["horizon", "drain"].includes(cfg.stopMode)
  )
    throw new Error("The model has invalid run settings.");
  assertModelShape(doc.model);
  // Draft graphs may be incomplete, but their shape must be safe to open and edit.
  try {
    validateProcessModel(doc.model);
  } catch {
    throw new Error("A block configuration is malformed.");
  }
  doc.model.schemaVersion = SCHEMA_VERSION;
  return {
    format: "des-playground",
    version: 1,
    id: typeof doc.id === "string" ? doc.id : crypto.randomUUID(),
    updatedAt:
      typeof doc.updatedAt === "string"
        ? doc.updatedAt
        : new Date().toISOString(),
    model: doc.model,
    config: cfg,
  };
}
export function documentWorkspace(doc: SavedModel): Workspace {
  const edges = [...doc.model.edges];
  // Canonical imports can name resources/stores directly. Materialize their
  // associations so the canvas and compiler retain the same requirements.
  for (const n of doc.model.nodes) {
    const c = n.config;
    const kind =
      c.kind === "server"
        ? "resource"
        : c.kind === "stock"
          ? "store"
          : undefined;
    const target =
      c.kind === "server"
        ? c.resourceId
        : c.kind === "stock"
          ? c.storeId
          : undefined;
    if (
      kind &&
      target &&
      !edges.some((e) => e.sourceId === n.id && e.kind === kind)
    )
      edges.push({
        id: crypto.randomUUID(),
        sourceId: n.id,
        targetId: target,
        kind,
      });
  }
  return {
    name: doc.model.name,
    config: { ...doc.config },
    nodes: doc.model.nodes.map((n) => {
      const c = n.config;
      const data: NodeData = { label: n.name, type: c.kind };
      if (c.kind === "source" || c.kind === "server") {
        const d =
          c.kind === "source"
            ? c.interarrivalDistribution
            : c.serviceDistribution;
        const { kind, ...params } = d;
        data.distribution = {
          type: kind as any,
          ...params,
          ...(d.kind === "normal" ? { stdDev: d.stddev } : {}),
        };
        if (c.kind === "source") {
          data.startTime = c.startTime;
          data.endTime = c.endTime;
          data.arrivalLimit = c.arrivalLimit;
          data.quantityDistribution = c.quantityDistribution;
          data.entityType = c.entityType;
          data.attributes = c.attributes;
        } else {
          data.capacity = c.capacity;
          data.queueDiscipline = c.queueDiscipline;
          data.priorityAttribute = c.priorityAttribute;
        }
      } else if (c.kind !== "sink") data.process = structuredClone(c);
      return { id: n.id, type: c.kind, position: { ...n.position }, data };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      sourceHandle: e.kind === "entityFlow" ? (e.port ?? "out") : e.kind,
      targetHandle:
        e.kind === "entityFlow" ? (e.targetPort ?? "in") : "association",
      label:
        e.kind === "entityFlow" && (!e.port || e.port === "out")
          ? undefined
          : e.kind === "entityFlow"
            ? e.port
            : e.kind,
      style:
        e.kind === "entityFlow"
          ? undefined
          : { strokeDasharray: "6 4", stroke: "#a78bfa" },
    })),
  };
}
export function readLibrary(): SavedModel[] {
  const raw = localStorage.getItem(MODEL_LIBRARY_KEY);
  if (!raw) return [];
  const list = JSON.parse(raw);
  if (!Array.isArray(list))
    throw new Error(
      "Saved model library could not be read. Export your current model before resetting app data.",
    );
  return list.map((x) => parseModelDocument(JSON.stringify(x)));
}
export function saveModel(doc: SavedModel) {
  doc = parseModelDocument(JSON.stringify(doc));
  const list = readLibrary();
  const at = list.findIndex((x) => x.id === doc.id);
  if (at < 0) list.push(doc);
  else list[at] = doc;
  localStorage.setItem(MODEL_LIBRARY_KEY, JSON.stringify(list));
}
export function readAutosave(): Workspace | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? documentWorkspace(parseModelDocument(raw)) : null;
  } catch {
    return null;
  }
}
export function writeAutosave(w: Workspace) {
  const doc = workspaceDocument(w, "autosave");
  parseModelDocument(JSON.stringify(doc));
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
}
