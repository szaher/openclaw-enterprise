# @openclaw-enterprise/visualization

Visualization and mind mapping plugin for OpenClaw Enterprise. Generates interactive D3.js visualizations rendered via OpenClaw Canvas (A2UI).

## Overview

This plugin provides three visualization tools:

- **generate_dependency_graph**: Force-directed graph showing task blocking relationships, critical paths, and dependency chains
- **generate_priority_matrix**: Eisenhower quadrant matrix plotting tasks by urgency (x-axis) and importance (y-axis) using real signals
- **generate_mind_map**: Tree/radial mind map organizing cross-system project data by theme, not source

All visualizations are data-driven, policy-aware (classification labels travel with data), and rendered client-side via D3.js v7.

## Architecture

```
Tasks / Cross-System Items
    |
    +-- DependencyGraphGenerator  --> D3 force-directed graph data
    +-- EisenhowerMatrixGenerator --> D3 quadrant scatter plot data
    +-- MindMapGenerator          --> D3 tree/radial layout data
    |
    v
Canvas A2UI (assets/*.html)
    |
    +-- dependency-graph.html  (force-directed, zoom/pan, click-to-highlight)
    +-- priority-matrix.html   (quadrant scatter, tooltips, quadrant filtering)
    +-- mind-map.html          (tree/radial toggle, collapse/expand, zoom/pan)
```

## Plugin Dependencies

- `policy-engine`: Policy evaluation for data access
- `audit-enterprise`: Audit logging for visualization generation

## Urgency and Importance Scoring

The priority matrix uses real signals from the task-intelligence plugin:

**Urgency (x-axis):**
- Deadline proximity (0-40 points)
- Follow-up frequency (0-30 points)
- SLA timer proximity (0-30 points)

**Importance (y-axis):**
- Sender seniority (0-35 points)
- Blocking relationships count (0-35 points)
- Data classification level (0-30 points)

## Mind Map Theming

Items are organized by theme using:
1. Explicit labels/tags from source systems
2. Keyword extraction from titles
3. Fallback to "uncategorized"

Built-in themes: engineering, design, infrastructure, testing, documentation, operations, security, planning.

## Development

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm typecheck    # Type-check without emitting
```

## File Structure

```
src/
  plugin.ts                # Entry point, registers three visualization tools
  openclaw-types.ts        # OpenClaw plugin API type definitions
  graphs/
    dependency.ts          # Task dependency graph generator
  matrix/
    eisenhower.ts          # Eisenhower priority matrix generator
  mindmap/
    generator.ts           # Mind map generator (theme-based organization)
assets/
  dependency-graph.html    # D3.js force-directed graph Canvas asset
  priority-matrix.html     # D3.js Eisenhower quadrant Canvas asset
  mind-map.html            # D3.js tree/radial mind map Canvas asset
tests/
  visualization.test.ts   # Unit tests
SKILL.md                   # Agent skill description
```
