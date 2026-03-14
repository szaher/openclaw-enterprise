# ADR-008: D3.js Visualization via Canvas A2UI Pattern

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/008-d3-canvas-visualization.md` |

---

## Context

The system needs to provide interactive visualizations for data such as policy evaluation results, audit trails, task correlation graphs, and tenant metrics. A rendering approach must be chosen that integrates with OpenClaw's existing UI patterns without introducing additional frontend framework dependencies.

Key requirements:

- Visualizations must be interactive (hover, zoom, filter, drill-down).
- The approach must integrate with OpenClaw's existing artifact rendering system.
- No additional frontend framework (React, Vue, etc.) should be required.
- Custom visualization types are needed (force-directed graphs, treemaps, matrices), not just standard charts.

---

## Decision

Use D3.js for visualization, rendered through OpenClaw's Canvas A2UI (Agent-to-UI) pattern.

Visualizations are built with D3.js and delivered to the user through OpenClaw's Canvas artifact rendering system. The Canvas pattern provides a sandboxed rendering surface where D3.js generates interactive SVG and HTML visualizations as self-contained HTML/CSS/JS assets.

---

## Rationale

- **Canvas is OpenClaw's built-in artifact rendering system**: Using Canvas means visualizations are delivered through the same mechanism as other rich artifacts, providing a consistent user experience with no additional infrastructure.

- **D3.js provides full control over interactive visualizations**: D3.js offers fine-grained control over every visual element, enabling custom visualizations tailored to the specific data and interactions needed.

- **No additional frontend framework needed**: D3.js works with standard SVG and DOM manipulation. There is no need to introduce React, Vue, or other frontend frameworks into the rendering pipeline.

---

## Alternatives Considered

### Chart.js or similar high-level charting library

Easier to use for standard charts but lacks the flexibility needed for custom visualizations like policy trees, task correlation graphs, and Eisenhower matrices.

### Custom React components

Would require introducing a frontend framework dependency and a build pipeline, adding complexity without proportional benefit since Canvas already provides the rendering surface.

### Static image generation (server-side)

Eliminates interactivity. Users cannot hover, zoom, filter, or drill down into visualizations.

---

## Consequences

### What becomes easier

- Creating highly customized, interactive visualizations that integrate seamlessly with OpenClaw's existing UI.
- Iterating on visualization design without frontend build pipeline changes.
- Delivering visualizations as self-contained artifacts.

### What becomes more difficult

- D3.js has a steep learning curve compared to higher-level charting libraries.
- Ensuring visualizations render correctly within the Canvas sandbox constraints.
- Accessibility (screen reader support, keyboard navigation) requires explicit effort with D3.js.

---

## Visualization Types

| Visualization | Purpose | D3.js Technique |
|--------------|---------|-----------------|
| Dependency graph | Task and project relationships | Force-directed graph |
| Eisenhower matrix | Task prioritization (urgency vs. importance) | Quadrant scatter plot |
| Mind map | Topic exploration and brainstorming | Tree/hierarchy layout |
| Policy hierarchy | Scope inheritance visualization | Treemap or sunburst |
| Audit timeline | Action history over time | Timeline with zoom |

---

## Implementation

- Dependency graph: `plugins/visualization/src/graphs/dependency.ts`
- Eisenhower matrix: `plugins/visualization/src/matrix/eisenhower.ts`
- Mind map generator: `plugins/visualization/src/mindmap/generator.ts`
- OpenClaw types: `plugins/visualization/src/openclaw-types.ts`
