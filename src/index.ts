#!/usr/bin/env node
// Webenta MCP server — stdio transport. Wraps the project-scoped REST API.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { api, resolveProjectId } from './client.js';

const PID_NOTE = ' For global API keys, pass `projectId`; project-scoped keys ignore it.';

const server = new Server(
  { name: 'webenta', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// ---- Tool schemas ----
const ColumnDef = z.object({
  name: z.string(),
  type: z.enum(['text', 'int', 'bigint', 'numeric', 'boolean', 'timestamptz', 'date', 'jsonb', 'uuid']),
  nullable: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
});

const Filter: z.ZodType = z.lazy(() =>
  z.union([
    z.object({ column: z.string(), op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'in']), value: z.any() }),
    z.object({ and: z.array(Filter) }),
    z.object({ or: z.array(Filter) })
  ])
);

const pid = z.string().optional();

const tools = [
  {
    name: 'list_projects',
    description: 'List all projects accessible with this API key. Project-scoped keys return their single project; global keys return every project the owning account has. Call this first when using a global key to discover project ids.',
    schema: z.object({})
  },
  {
    name: 'get_project_instructions',
    description: 'Get the project-specific agent instructions written by the project owner. The server automatically returns these once per session attached to your first tool call, but call this tool explicitly to re-read them at any time.' + PID_NOTE,
    schema: z.object({ projectId: pid })
  },
  {
    name: 'get_project_info',
    description: 'Get a project: name, storage usage, plan, and limits. ALWAYS call this first if you are about to do bulk inserts.' + PID_NOTE,
    schema: z.object({ projectId: pid })
  },
  {
    name: 'list_tables',
    description: 'List all user-defined tables with column definitions, row count and byte size.' + PID_NOTE,
    schema: z.object({ projectId: pid })
  },
  {
    name: 'create_table',
    description: 'Create a new table. Implicit id (bigserial PK) and created_at (timestamptz default now()) are added automatically.' + PID_NOTE,
    schema: z.object({ projectId: pid, name: z.string(), columns: z.array(ColumnDef) })
  },
  {
    name: 'drop_table',
    description: 'Drop a table (irreversible).' + PID_NOTE,
    schema: z.object({ projectId: pid, name: z.string() })
  },
  {
    name: 'add_column',
    description: 'Add a column to an existing table.' + PID_NOTE,
    schema: z.object({ projectId: pid, table: z.string(), column: ColumnDef })
  },
  {
    name: 'rename_column',
    description: 'Rename a column.' + PID_NOTE,
    schema: z.object({ projectId: pid, table: z.string(), from: z.string(), to: z.string() })
  },
  {
    name: 'drop_column',
    description: 'Drop a column from a table.' + PID_NOTE,
    schema: z.object({ projectId: pid, table: z.string(), column: z.string() })
  },
  {
    name: 'insert_rows',
    description: 'Insert one or more rows. Returns inserted ids. Each row is an object keyed by column name; missing columns are null. id and created_at are auto-set.' + PID_NOTE,
    schema: z.object({ projectId: pid, table: z.string(), rows: z.array(z.record(z.any())).min(1) })
  },
  {
    name: 'query_rows',
    description: 'Query rows with optional filter, ordering and pagination. Default limit 100, max 1000.' + PID_NOTE,
    schema: z.object({
      projectId: pid,
      table: z.string(),
      filter: Filter.optional(),
      orderBy: z.object({ column: z.string(), direction: z.enum(['asc', 'desc']).optional() }).optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      offset: z.number().int().min(0).optional()
    })
  },
  {
    name: 'update_row',
    description: 'Update a single row by id.' + PID_NOTE,
    schema: z.object({ projectId: pid, table: z.string(), id: z.number(), values: z.record(z.any()) })
  },
  {
    name: 'delete_row',
    description: 'Delete a single row by id.' + PID_NOTE,
    schema: z.object({ projectId: pid, table: z.string(), id: z.number() })
  },
  {
    name: 'aggregate',
    description: 'Run sum/count/avg/min/max with optional group_by, date_trunc bucket, or JOIN to a lookup table for labels. Returns rows of { group_value?, value }.' + PID_NOTE,
    schema: z.object({
      projectId: pid,
      table: z.string(),
      op: z.enum(['count', 'sum', 'avg', 'min', 'max']),
      column: z.string().optional(),
      groupBy: z.object({
        column: z.string(),
        bucket: z.enum(['day', 'week', 'month', 'year']).optional(),
        join: z.object({
          table: z.string(),
          on: z.string(),
          label: z.string()
        }).optional()
      }).optional(),
      filter: Filter.optional(),
      orderBy: z.enum(['group_asc', 'group_desc', 'value_asc', 'value_desc']).optional(),
      limit: z.number().int().min(1).max(10000).optional()
    })
  },
  {
    name: 'get_dashboard',
    description: "Get the project's dashboard widget layout." + PID_NOTE,
    schema: z.object({ projectId: pid })
  },
  {
    name: 'set_dashboard',
    description: "Replace the entire dashboard layout. Each widget: { id, w (1-12), type (bar|line|area|pie|number|table), config: { title?, table, op, column?, groupBy?: { column, bucket?, join?: { table, on, label } }, filter?, orderBy?, limit? } }. bar/line/area/pie need a groupBy (pie = one slice per group). number is a single KPI; table lists rows." + PID_NOTE,
    schema: z.object({ projectId: pid, layout: z.array(z.any()) })
  },
  {
    name: 'add_widget',
    description: 'Append a widget to the dashboard. Generates an id if missing.' + PID_NOTE,
    schema: z.object({ projectId: pid, widget: z.any() })
  },
  {
    name: 'remove_widget',
    description: 'Remove a widget by id from the dashboard.' + PID_NOTE,
    schema: z.object({ projectId: pid, id: z.string() })
  }
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema)
  }))
}));

// Tracks which (project) sessions have already received the auto-injected
// instructions banner. In stdio mode this is the lifetime of the process —
// one session per client launch.
const instructionsDelivered = new Set<string>();

async function fetchInstructions(pid: string): Promise<string> {
  try {
    const info = await api<{ instructions?: string }>('GET', `/api/v1/projects/${pid}/instructions`);
    return (info.instructions ?? '').trim();
  } catch {
    return '';
  }
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  const parsed = tool.schema.parse(req.params.arguments ?? {});

  if (tool.name === 'list_projects') {
    const list = await api('GET', '/api/v1/projects');
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  }

  const pid = await resolveProjectId((parsed as any).projectId);

  if (tool.name === 'get_project_instructions') {
    const instructions = await fetchInstructions(pid);
    instructionsDelivered.add(pid);
    return { content: [{ type: 'text', text: instructions || '(no project instructions set)' }] };
  }

  const out = await dispatch(tool.name, pid, parsed);
  const body = JSON.stringify(out, null, 2);

  if (!instructionsDelivered.has(pid)) {
    instructionsDelivered.add(pid);
    const instructions = await fetchInstructions(pid);
    if (instructions) {
      const banner =
        `=== PROJECT INSTRUCTIONS (read these before continuing — written by the project owner) ===\n` +
        `${instructions}\n` +
        `=== END PROJECT INSTRUCTIONS ===\n\n` +
        `--- tool result for ${tool.name} ---\n`;
      return { content: [{ type: 'text', text: banner + body }] };
    }
  }

  return { content: [{ type: 'text', text: body }] };
});

async function dispatch(name: string, pid: string, args: any): Promise<unknown> {
  const base = `/api/v1/projects/${pid}`;
  switch (name) {
    case 'get_project_instructions': return api('GET', `${base}/instructions`);
    case 'get_project_info': return api('GET', `${base}/info`);
    case 'list_tables':      return api('GET', `${base}/tables`);
    case 'create_table':     return api('POST', `${base}/tables`, args);
    case 'drop_table':       return api('DELETE', `${base}/tables/${enc(args.name)}`);
    case 'add_column':       return api('POST', `${base}/tables/${enc(args.table)}/columns`, args.column);
    case 'rename_column':    return api('PATCH', `${base}/tables/${enc(args.table)}/columns/${enc(args.from)}`, { rename: args.to });
    case 'drop_column':      return api('DELETE', `${base}/tables/${enc(args.table)}/columns/${enc(args.column)}`);
    case 'insert_rows':      return api('POST', `${base}/tables/${enc(args.table)}/rows`, { rows: args.rows });
    case 'query_rows': {
      const q = new URLSearchParams();
      if (args.filter)  q.set('filter', JSON.stringify(args.filter));
      if (args.orderBy) q.set('orderBy', JSON.stringify(args.orderBy));
      if (args.limit !== undefined)  q.set('limit', String(args.limit));
      if (args.offset !== undefined) q.set('offset', String(args.offset));
      const qs = q.toString();
      return api('GET', `${base}/tables/${enc(args.table)}/rows${qs ? '?' + qs : ''}`);
    }
    case 'update_row':    return api('PATCH', `${base}/tables/${enc(args.table)}/rows/${args.id}`, { values: args.values });
    case 'delete_row':    return api('DELETE', `${base}/tables/${enc(args.table)}/rows/${args.id}`);
    case 'aggregate':     return api('POST', `${base}/query/aggregate`, args);
    case 'get_dashboard': return api('GET', `${base}/dashboard`);
    case 'set_dashboard': return api('PUT', `${base}/dashboard`, { layout: args.layout });
    case 'add_widget': {
      const cur = await api<{ layout: any[] }>('GET', `${base}/dashboard`);
      const w = { id: args.widget.id ?? crypto.randomUUID(), ...args.widget };
      return api('PUT', `${base}/dashboard`, { layout: [...cur.layout, w] });
    }
    case 'remove_widget': {
      const cur = await api<{ layout: any[] }>('GET', `${base}/dashboard`);
      return api('PUT', `${base}/dashboard`, { layout: cur.layout.filter((w) => w.id !== args.id) });
    }
    default: throw new Error(`Unhandled: ${name}`);
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function zodToJsonSchema(schema: z.ZodType<unknown>, depth = 0): unknown {
  const def = (schema as any)._def;
  if (def?.typeName === 'ZodObject') {
    const shape = def.shape();
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      props[k] = zodToJsonSchema(v as z.ZodType, depth);
      if (!(v as any).isOptional?.()) required.push(k);
    }
    return { type: 'object', properties: props, required };
  }
  if (def?.typeName === 'ZodString') return { type: 'string' };
  if (def?.typeName === 'ZodNumber') return { type: 'number' };
  if (def?.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (def?.typeName === 'ZodArray') return { type: 'array', items: zodToJsonSchema(def.type, depth) };
  if (def?.typeName === 'ZodEnum') return { type: 'string', enum: def.values };
  if (def?.typeName === 'ZodOptional') return zodToJsonSchema(def.innerType, depth);
  if (def?.typeName === 'ZodUnion') return { oneOf: def.options.map((o: z.ZodType) => zodToJsonSchema(o, depth)) };
  if (def?.typeName === 'ZodRecord') return { type: 'object', additionalProperties: true };
  if (def?.typeName === 'ZodLazy') {
    if (depth >= 2) return { type: 'object' };
    return zodToJsonSchema(def.getter(), depth + 1);
  }
  if (def?.typeName === 'ZodAny') return {};
  return {};
}

const transport = new StdioServerTransport();
await server.connect(transport);
