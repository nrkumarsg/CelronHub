import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// Load environment variables (.env in root or local)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dfoihdzpgkrtyerzzchm.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const server = new McpServer({
    name: "CelronHub MCP Server",
    version: "1.0.0"
});

// 1. Search Catalog
server.tool(
    "celronhub_search_catalog",
    "Search parts, marine equipment, barcodes, or datasheets in the CelronHub Catalog",
    {
        query: z.string().optional().describe("Search query for part name, barcode, description, or model"),
        category: z.string().optional().describe("Filter catalog items by category"),
        limit: z.number().optional().default(20).describe("Maximum number of items to return")
    },
    async ({ query, category, limit }) => {
        try {
            let req = supabase.from("catalog").select("*").limit(limit);
            if (query) {
                req = req.or(`description.ilike.%${query}%,part_number.ilike.%${query}%,barcode.ilike.%${query}%`);
            }
            if (category) {
                req = req.eq("category", category);
            }

            const { data, error } = await req;
            if (error) {
                return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }] };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
            };
        } catch (e) {
            return { content: [{ type: "text", text: `Execution Error: ${e.message}` }] };
        }
    }
);

// 2. Manage Jobs
server.tool(
    "celronhub_manage_jobs",
    "Query, inspect, or filter job cards and repair workflows in CelronHub",
    {
        action: z.enum(["list", "get_by_number"]).default("list").describe("Action to perform: list jobs or get job by job number"),
        job_number: z.string().optional().describe("Specific job card number (required for get_by_number)"),
        status: z.string().optional().describe("Filter jobs by status (e.g., 'IN_PROGRESS', 'COMPLETED', 'PENDING')"),
        limit: z.number().optional().default(20).describe("Max records to retrieve")
    },
    async ({ action, job_number, status, limit }) => {
        try {
            if (action === "get_by_number") {
                if (!job_number) {
                    return { content: [{ type: "text", text: "Error: job_number parameter is required for action 'get_by_number'." }] };
                }
                const { data, error } = await supabase.from("jobs").select("*").eq("job_number", job_number).single();
                if (error) {
                    return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }] };
                }
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }

            let req = supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(limit);
            if (status) {
                req = req.eq("status", status);
            }
            const { data, error } = await req;
            if (error) {
                return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }] };
            }
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Execution Error: ${e.message}` }] };
        }
    }
);

// 3. Customer Enquiries
server.tool(
    "celronhub_customer_enquiries",
    "Fetch customer enquiries, RFQs, and client communications",
    {
        status: z.string().optional().describe("Filter enquiries by status (e.g. 'NEW', 'IN_REVIEW', 'QUOTED')"),
        search: z.string().optional().describe("Search term for customer name, subject, or ref number"),
        limit: z.number().optional().default(20).describe("Maximum records to return")
    },
    async ({ status, search, limit }) => {
        try {
            let req = supabase.from("customer_enquiries").select("*").order("created_at", { ascending: false }).limit(limit);
            if (status) {
                req = req.eq("status", status);
            }
            if (search) {
                req = req.or(`customer_name.ilike.%${search}%,enquiry_number.ilike.%${search}%,subject.ilike.%${search}%`);
            }
            const { data, error } = await req;
            if (error) {
                return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }] };
            }
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Execution Error: ${e.message}` }] };
        }
    }
);

// 4. Celron Expenses
server.tool(
    "celronhub_manage_expenses",
    "Query and list expense vouchers, job expenses, and financial tracking data",
    {
        category: z.string().optional().describe("Filter expenses by category"),
        limit: z.number().optional().default(25).describe("Max records to retrieve")
    },
    async ({ category, limit }) => {
        try {
            let req = supabase.from("celron_expenses").select("*").order("expense_date", { ascending: false }).limit(limit);
            if (category) {
                req = req.eq("category", category);
            }
            const { data, error } = await req;
            if (error && error.code === '42P01') {
                // Fallback to job_expenses if celron_expenses table is distinct
                const fallback = await supabase.from("job_expenses").select("*").limit(limit);
                return { content: [{ type: "text", text: JSON.stringify(fallback.data || [], null, 2) }] };
            }
            if (error) {
                return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }] };
            }
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Execution Error: ${e.message}` }] };
        }
    }
);

// 5. Activity Audit Logs
server.tool(
    "celronhub_activity_logs",
    "Fetch recent system activity logs and audit trails",
    {
        limit: z.number().optional().default(20).describe("Number of activity logs to fetch"),
        action_filter: z.string().optional().describe("Filter log entries by action name")
    },
    async ({ limit, action_filter }) => {
        try {
            let req = supabase.from("activity_audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
            if (action_filter) {
                req = req.ilike("action", `%${action_filter}%`);
            }
            const { data, error } = await req;
            if (error) {
                // Fallback to secondary audit table name if exists
                const fallback = await supabase.from("activity_logs").select("*").limit(limit);
                return { content: [{ type: "text", text: JSON.stringify(fallback.data || [], null, 2) }] };
            }
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Execution Error: ${e.message}` }] };
        }
    }
);

// 6. Mobile APK Releases
server.tool(
    "celronhub_get_apk_list",
    "List mobile APK build versions and releases available in CelronHub",
    {
        limit: z.number().optional().default(10).describe("Max APK releases to return")
    },
    async ({ limit }) => {
        try {
            const { data, error } = await supabase.from("apk_releases").select("*").order("created_at", { ascending: false }).limit(limit);
            if (error) {
                return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }] };
            }
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Execution Error: ${e.message}` }] };
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("CelronHub MCP Server running on stdio");
}

main().catch((err) => {
    console.error("Fatal MCP Server Error:", err);
    process.exit(1);
});
