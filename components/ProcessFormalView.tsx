import React from "react";
import type { DesModel } from "../lib/model";
import { BLOCK_LABELS, describeRules } from "../lib/processNotation";
import { distributionTex } from "../lib/formalModel";
import { MathFormula } from "./Math";
export default function ProcessFormalView({ model }: { model: DesModel }) {
  return (
    <div className="des-formal">
      <h3>Places, activities and state changes</h3>
      <p>
        Petri-inspired process specification · time in {model.unit}s. Entity
        tokens retain identity, type, quantity and numeric attributes.
        Activities reserve resources at start and return them at completion.
        Stores hold quantities; signal transitions create a distinct token.
      </p>
      <MathFormula
        display
        tex={String.raw`X(t)=\bigl(\mathcal Q(t),\mathcal B(t),\mathcal S(t),\mathcal E(t)\bigr),\qquad \text{start at }r\text{ only if }b_r(t)<c_r(t),\quad s_j(t)\ge0`}
      />
      <div className="des-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Block / place</th>
              <th>Rule and initial state</th>
              <th>Outputs / associations</th>
            </tr>
          </thead>
          <tbody>
            {model.nodes.map((n) => {
              const c = n.config;
              const d =
                c.kind === "source"
                  ? c.interarrivalDistribution
                  : c.kind === "server"
                    ? c.serviceDistribution
                    : c.kind === "delay"
                      ? c.distribution
                      : null;
              return (
                <tr key={n.id}>
                  <td>
                    <strong>{n.name}</strong>
                    <br />
                    {BLOCK_LABELS[c.kind]}
                  </td>
                  <td>
                    {describeRules(c, model)}
                    {(c.kind === "source" || c.kind === "population") && (
                      <div>
                        Type: {c.entityType ?? "Entity"}
                        {Object.entries(c.attributes ?? {}).map(
                          ([key, value]) => (
                            <span key={key}>
                              {" "}
                              · {key} = {value}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    {d && (
                      <MathFormula
                        tex={String.raw`\tau\sim ` + distributionTex(d)}
                      />
                    )}
                  </td>
                  <td>
                    {model.edges
                      .filter((e) => e.sourceId === n.id)
                      .map((e) => (
                        <div key={e.id}>
                          {e.kind === "entityFlow" ? (e.port ?? "out") : e.kind}{" "}
                          →{" "}
                          {model.nodes.find((x) => x.id === e.targetId)?.name ??
                            "Missing block"}
                          {e.targetPort && e.targetPort !== "in"
                            ? ` · input ${e.targetPort}`
                            : ""}
                        </div>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
