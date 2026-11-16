import React from "react";
import { shiftCapacity } from "../../lib/shifts";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { NodeData } from "../../types";
import {
  PlayCircle, Users, LogOut, Server, Clock, Package, Database,
  Archive, GitBranch, Shuffle, Zap, Layers, Scissors, GitMerge, Tag, Activity,
} from "lucide-react";

const KIND_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  source:     { icon: PlayCircle, color: "var(--success)" },
  population: { icon: Users,      color: "var(--success)" },
  sink:       { icon: LogOut,     color: "var(--error)" },
  server:     { icon: Server,     color: "var(--accent)" },
  delay:      { icon: Clock,      color: "var(--primary)" },
  store:      { icon: Package,    color: "var(--accent)" },
  resource:   { icon: Database,   color: "var(--success)" },
  stock:      { icon: Archive,    color: "var(--accent)" },
  decision:   { icon: GitBranch,  color: "var(--warning)" },
  router:     { icon: Shuffle,    color: "var(--accent)" },
  signal:     { icon: Zap,        color: "var(--primary)" },
  batch:      { icon: Layers,     color: "#0d9488" },
  unbatch:    { icon: Scissors,   color: "#0d9488" },
  join:       { icon: GitMerge,   color: "#0d9488" },
  assign:     { icon: Tag,        color: "#818cf8" },
};

const nodeBase: React.CSSProperties = {
  position: "relative",
  background: "var(--des-fill)",
  color: "var(--des-label)",
  border: "1.5px solid var(--des-stroke)",
  borderRadius: "var(--radius-sm)",
  minWidth: 160,
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  padding: "8px 12px",
  boxShadow: "var(--shadow-sm)",
};

const selectedStyle: React.CSSProperties = {
  border: "1.5px solid var(--primary)",
  boxShadow: "var(--focus-ring)",
};

const activeStyle: React.CSSProperties = {
  border: "1.5px solid var(--primary)",
  boxShadow: "0 0 0 3px var(--primary-soft), var(--shadow-sm)",
};

const metaRow: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: 4,
};

const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "var(--primary)",
  border: "2px solid var(--bg-elevated)",
};

export default function ProcessNode({
  data,
  selected,
}: NodeProps<Node<NodeData>>) {
  const type = data.type;
  const s = data.simState;
  const shared = type === "store" || type === "resource";
  const output =
    type === "decision" || type === "router"
      ? ["true", "false"]
      : type === "signal"
        ? ["out", "spawn"]
        : ["sink", "store", "resource"].includes(type)
          ? []
          : ["out"];

  const { icon: Icon, color: iconColor } = KIND_ICON[type] ?? { icon: Activity, color: "var(--primary)" };

  const shapeOverride: React.CSSProperties =
    type === "resource" ? { borderRadius: 20 } :
    type === "store"    ? { borderRadius: 12 } :
    type === "join"     ? { paddingLeft: 24 } :
    {};

  const stateStyle: React.CSSProperties = data.simActive
    ? activeStyle
    : selected
      ? selectedStyle
      : {};

  return (
    <div style={{ ...nodeBase, ...shapeOverride, ...stateStyle }}>
      {!["source", "population", "store", "resource", "join"].includes(type) && (
        <Handle type="target" position={Position.Left} id="in" style={handleStyle} />
      )}
      {type === "join" &&
        ["a", "b"].map((port, i) => (
          <React.Fragment key={port}>
            <Handle
              type="target"
              position={Position.Left}
              id={port}
              style={{ ...handleStyle, top: i ? "75%" : "35%" }}
            />
            <span className="process-input-label" style={{ top: i ? "75%" : "35%" }}>
              {port}
            </span>
          </React.Fragment>
        ))}
      {shared && (
        <Handle type="target" position={Position.Top} id="association" style={handleStyle} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <Icon size={15} style={{ color: iconColor, flexShrink: 0 }} />
        <span style={{ fontWeight: 650, color: "var(--text)", fontSize: 13 }}>{data.label}</span>
      </div>

      {s && ["source", "population", "signal"].includes(type) && (
        <div style={metaRow}>Generated: {s.generated ?? 0}</div>
      )}
      {s && ["sink", "decision", "router", "batch", "unbatch", "join"].includes(type) && (
        <div style={metaRow}>Completed: {s.completed ?? 0}</div>
      )}
      {!s && type === "population" && data.process?.kind === "population" && (
        <div style={metaRow}>{data.process.count} initial entities</div>
      )}
      {type === "resource" && data.process?.kind === "resource" && (
        <div style={metaRow}>
          {s ? `${s.available} avail / ` : ""}
          {s?.capacity ?? shiftCapacity(data.process, 0)} units
        </div>
      )}
      {type === "store" && data.process?.kind === "store" && (
        <div style={metaRow}>{s?.stock ?? data.process.initial} in stock</div>
      )}
      {["server", "delay", "stock", "batch", "join"].includes(type) && (
        <div style={metaRow}>
          {s
            ? `Waiting ${s.queueLength} · active ${s.busyServers}`
            : type === "stock" && data.process?.kind === "stock"
              ? data.process.operation
              : "Select to configure"}
        </div>
      )}

      {output.map((port, i) => (
        <React.Fragment key={port}>
          {output.length > 1 && (
            <span
              className="process-port-label"
              style={{ top: i === 0 ? "35%" : "75%" }}
            >
              {port}
            </span>
          )}
          <Handle
            type="source"
            position={Position.Right}
            id={port}
            style={{
              ...handleStyle,
              top: output.length === 1 ? "50%" : i === 0 ? "35%" : "75%",
            }}
          />
        </React.Fragment>
      ))}

      {(type === "server" || type === "stock") && (
        <>
          <small className="process-association">
            {type === "server" ? "resource" : "store"}
          </small>
          <Handle
            type="source"
            position={Position.Bottom}
            id={type === "server" ? "resource" : "store"}
            style={handleStyle}
          />
        </>
      )}
    </div>
  );
}
