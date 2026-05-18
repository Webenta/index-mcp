# @webenta/mcp

> **Give Claude (and any MCP-compatible AI) full control over your [Webenta Index](https://index.webenta.sk) project — create tables, query rows, build dashboards, and more.**

[![npm version](https://img.shields.io/npm/v/@webenta/mcp.svg?style=flat-square)](https://www.npmjs.com/package/@webenta/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-orange.svg?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blueviolet?style=flat-square)](https://modelcontextprotocol.io)

---

## What is Webenta Index?

Webenta Index is a structured data platform built for AI-first workflows. Create tables, pour data in, and let Claude drive the analysis, dashboards, and automation — all through natural language.

This package exposes the full Webenta REST API as an MCP server so Claude Code, Claude Desktop, or any MCP-compatible host can interact with your project without writing a line of code.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_project_info` | Project name, plan, storage usage and limits |
| `list_tables` | All tables with columns, row counts and byte sizes |
| `create_table` | Create a table with typed columns |
| `drop_table` | Drop a table (irreversible) |
| `add_column` | Add a column to an existing table |
| `rename_column` | Rename a column |
| `drop_column` | Drop a column |
| `insert_rows` | Insert one or more rows |
| `query_rows` | Query with filters, ordering and pagination |
| `update_row` | Update a single row by id |
| `delete_row` | Delete a single row by id |
| `aggregate` | sum / count / avg / min / max with optional group-by and date bucketing |
| `get_dashboard` | Fetch the current dashboard widget layout |
| `set_dashboard` | Replace the entire dashboard layout |
| `add_widget` | Append a chart or metric widget to the dashboard |
| `remove_widget` | Remove a widget by id |

---

## Quick Start

### 1. Get an API key

Sign in to [index.webenta.sk](https://index.webenta.sk), open your project, and go to **API Keys → New key**.

### 2. Add to Claude Code

Create `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "webenta": {
      "command": "npx",
      "args": ["-y", "@webenta/mcp"],
      "env": {
        "WEBENTA_API_URL": "https://index.webenta.sk",
        "WEBENTA_API_KEY": "wk_live_YOUR_KEY_HERE"
      }
    }
  }
}
```

### 3. Add to Claude Desktop

Same block, pasted into your Claude Desktop config:

- **macOS** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** `%APPDATA%\Claude\claude_desktop_config.json`

---

## Remote Connection (Claude web / CLI)

If you self-host Webenta Index, the MCP server is also available over HTTPS with OAuth.

**Claude web** — go to **Settings → Integrations → Add MCP server** and enter your server URL. Claude will discover the OAuth endpoint automatically and prompt for your API key as the `client_secret`.

**Claude Code CLI** (one-time setup):

```bash
claude mcp add webenta https://mcp.index.webenta.sk/mcp \
  --transport http \
  --header "Authorization: Bearer wk_live_YOUR_KEY_HERE"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBENTA_API_URL` | `http://localhost:3000` | Base URL of your Webenta instance |
| `WEBENTA_API_KEY` | _(required)_ | Your `wk_live_…` project API key |

---

## Column Types

`text` · `int` · `bigint` · `numeric` · `boolean` · `timestamptz` · `date` · `jsonb` · `uuid`

`id` (bigserial PK) and `created_at` (timestamptz) are added automatically to every table.

---

## Self-Hosting

The full server stack (web app + HTTP MCP server + Postgres) ships as Docker images. See the [webenta-saas](https://github.com/Webenta/webenta-saas) repository for `docker-compose.prod.yml` and deployment docs.

---

## License

MIT — © [Webenta](https://webenta.sk)
