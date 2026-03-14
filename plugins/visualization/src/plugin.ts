import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { Task } from '@openclaw-enterprise/shared/types.js';
import { DependencyGraphGenerator } from './graphs/dependency.js';
import { EisenhowerMatrixGenerator } from './matrix/eisenhower.js';
import { MindMapGenerator } from './mindmap/generator.js';
import type { CrossSystemItem } from './mindmap/generator.js';

export function activate(api: OpenClawPluginAPI): void {
  const dependencyGraphGenerator = new DependencyGraphGenerator();
  const eisenhowerMatrixGenerator = new EisenhowerMatrixGenerator();
  const mindMapGenerator = new MindMapGenerator();

  // Tool: generate_dependency_graph
  api.registerTool({
    name: 'generate_dependency_graph',
    description:
      'Generate a D3.js force-directed dependency graph from tasks with blocking relationships. ' +
      'Returns graph data (nodes, links) suitable for rendering via Canvas A2UI.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of Task objects with blocking relationships in urgencySignals',
        },
      },
      required: ['tasks'],
    },
    execute: async (params) => {
      const p = params as { tasks: Task[] };
      const graphData = dependencyGraphGenerator.generate(p.tasks);
      return {
        visualization: 'dependency-graph',
        data: graphData,
        canvasAsset: 'dependency-graph.html',
      };
    },
  });

  // Tool: generate_priority_matrix
  api.registerTool({
    name: 'generate_priority_matrix',
    description:
      'Generate an Eisenhower priority matrix (urgent/important quadrants) from tasks. ' +
      'Uses real urgency signals (deadlines, SLA, follow-ups) and importance signals ' +
      '(seniority, blocking count, classification). Returns quadrant data for Canvas A2UI.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of Task objects with urgency signals and priority scores',
        },
      },
      required: ['tasks'],
    },
    execute: async (params) => {
      const p = params as { tasks: Task[] };
      const matrixData = eisenhowerMatrixGenerator.generate(p.tasks);
      return {
        visualization: 'priority-matrix',
        data: matrixData,
        canvasAsset: 'priority-matrix.html',
      };
    },
  });

  // Tool: generate_mind_map
  api.registerTool({
    name: 'generate_mind_map',
    description:
      'Generate a D3.js tree/radial mind map from cross-system project data. ' +
      'Organizes items by theme (not by source system) so related work from ' +
      'Jira, GitHub, GDrive, etc. appears together. Returns tree data for Canvas A2UI.',
    parameters: {
      type: 'object',
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project to use as root node',
        },
        items: {
          type: 'array',
          description: 'Array of CrossSystemItem objects from connectors',
        },
        tasks: {
          type: 'array',
          description: 'Array of Task objects (alternative to items; will be converted automatically)',
        },
      },
      required: ['projectName'],
    },
    execute: async (params) => {
      const p = params as {
        projectName: string;
        items?: CrossSystemItem[];
        tasks?: Task[];
      };

      let items: CrossSystemItem[];
      if (p.items && p.items.length > 0) {
        items = p.items;
      } else if (p.tasks && p.tasks.length > 0) {
        items = mindMapGenerator.tasksToItems(p.tasks);
      } else {
        items = [];
      }

      const mindMapData = mindMapGenerator.generate(p.projectName, items);
      return {
        visualization: 'mind-map',
        data: mindMapData,
        canvasAsset: 'mind-map.html',
      };
    },
  });
}
