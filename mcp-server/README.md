# CelronHub Model Context Protocol (MCP) Server

This MCP server provides a direct bridge connecting **Claude** (Claude Desktop, Claude Code, Cursor) and **Gemini** (Google AI Studio, Antigravity IDE, Gemini CLI) to CelronHub's database and business workflows.

---

## Exposed MCP Tools

1. `celronhub_search_catalog` – Search marine parts, equipment, barcodes, or datasheets.
2. `celronhub_manage_jobs` – View, inspect, or filter job cards and repair status.
3. `celronhub_customer_enquiries` – Fetch RFQs and customer enquiries.
4. `celronhub_manage_expenses` – List expense logs, budget items, and job costs.
5. `celronhub_activity_logs` – Inspect system audit logs and recent activities.
6. `celronhub_get_apk_list` – List available mobile APK releases and build versions.

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd mcp-server
npm install
```

### 2. Configure in Claude Desktop
Add the contents of `claude_desktop_config.example.json` to your `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

```json
{
  "mcpServers": {
    "celronhub": {
      "command": "node",
      "args": ["C:/GoogleGravityDemo/CelronHub/mcp-server/src/index.js"],
      "env": {
        "VITE_SUPABASE_URL": "https://dfoihdzpgkrtyerzzchm.supabase.co",
        "VITE_SUPABASE_ANON_KEY": "your-supabase-key"
      }
    }
  }
}
```

### 3. Configure in Gemini / Antigravity IDE / Gemini CLI
Add the server entry to your Gemini MCP tools config file or Antigravity settings:

```json
{
  "mcpServers": {
    "celronhub": {
      "command": "node",
      "args": ["C:/GoogleGravityDemo/CelronHub/mcp-server/src/index.js"],
      "env": {
        "VITE_SUPABASE_URL": "https://dfoihdzpgkrtyerzzchm.supabase.co",
        "VITE_SUPABASE_ANON_KEY": "your-supabase-key"
      }
    }
  }
}
```

---

## Testing locally

Run:
```bash
node src/index.js
```
The server will start listening for MCP JSON-RPC protocol requests over `stdio`.
