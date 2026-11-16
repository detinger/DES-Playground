import React from "react";
import { shiftCapacity } from "../../lib/shifts";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { NodeData } from "../../types";
import { BLOCK_LABELS } from "../../lib/processNotation";
export default function ProcessNode({
  data,
  selected,
}: NodeProps<Node<NodeData>>) {
  const type = data.type,
    s = data.simState;
  const shared = type === "store" || type === "resource";
  const output =
    type === "decision" || type === "router"
      ? ["true", "false"]
      : type === "signal"
        ? ["out", "spawn"]
        : ["sink", "store", "resource"].includes(type)
          ? []
          : ["out"];
  return (
    <div
      className={`process-node process-node--${type}${selected ? " is-selected" : ""}${data.simActive ? " is-active" : ""}`}
    >
      {!["source", "population", "store", "resource", "join"].includes(
        type,
      ) && <Handle type="target" position={Position.Left} id="in" />}
      {type === "join" &&
        ["a", "b"].map((port, i) => (
          <React.Fragment key={port}>
            <Handle
              type="target"
              position={Position.Left}
              id={port}
              style={{ top: i ? "75%" : "35%" }}
            />
            <span
              className="process-input-label"
              style={{ top: i ? "75%" : "35%" }}
            >
              {port}
            </span>
          </React.Fragment>
        ))}
      {shared && (
        <Handle type="target" position={Position.Top} id="association" />
      )}
      <span className="process-node-kind">{BLOCK_LABELS[type]}</span>
      <strong>{data.label}</strong>
      {s && ["source", "population", "signal"].includes(type) && (
        <small>Generated: {s.generated ?? 0}</small>
      )}
      {s &&
        ["sink", "decision", "router", "batch", "unbatch", "join"].includes(
          type,
        ) && <small>Completed: {s.completed ?? 0}</small>}
      {type === "population" && data.process?.kind === "population" && (
        <small>{data.process.count} initial entities</small>
      )}
      {type === "resource" && data.process?.kind === "resource" && (
        <small>
          {s ? `${s.available} available / ` : ""}
          {s?.capacity ?? shiftCapacity(data.process, 0)} units
        </small>
      )}
      {type === "store" && data.process?.kind === "store" && (
        <small>{s?.stock ?? data.process.initial} units in stock</small>
      )}
      {["server", "delay", "stock", "batch", "join"].includes(type) && (
        <small>
          {s
            ? `Waiting ${s.queueLength} · active ${s.busyServers}`
            : type === "stock" && data.process?.kind === "stock"
              ? data.process.operation
              : "Select to configure"}
        </small>
      )}
      {output.map((port, i) => (
        <React.Fragment key={port}>
          <span
            className="process-port-label"
            style={{
              top: output.length === 1 ? "50%" : i === 0 ? "35%" : "75%",
            }}
          >
            {port}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={port}
            style={{
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
          />
        </>
      )}
    </div>
  );
}
