import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { createCodeTools } from "./code-tools";
import { cloneGitRepository, importGitFilesIntoProject } from "./git-clone";
import { handleAuthRoutes } from "./lib/auth-routes";

// Force use of chat completions API instead of responses API
const openaiProvider = createOpenAI({
  compatibility: 'strict'
});
const model = openaiProvider('gpt-4o-mini');
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools and code tools
    const codeTools = createCodeTools(this.env);
    const allTools = {
      ...tools,
      ...codeTools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer, context }) => {
        console.log('[Chat] Context received:', JSON.stringify(context));

        // Extract projectId from the latest user message metadata
        const lastUserMessage = this.messages.filter(m => m.role === 'user').pop();
        const projectId = (lastUserMessage as any)?.metadata?.projectId || context?.projectId;
        const currentFile = (lastUserMessage as any)?.metadata?.currentFile || context?.currentFile;

        console.log('[Chat] Extracted projectId:', projectId);
        console.log('[Chat] Extracted currentFile:', currentFile);

        // Create context object for tools - include env
        const toolContext = {
          env: this.env,
          context: {
            projectId,
            currentFile
          }
        };

        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions,
          context: toolContext
        });

        const result = streamText({
          system: `You are an AUTONOMOUS AI code assistant with full agency to modify, create, and manage code files.

CRITICAL: The current project ID is: ${projectId}
You MUST include this projectId parameter in ALL tool calls.

AGENTIC BEHAVIOR - MULTI-STEP EXECUTION:
- You have FULL AUTONOMY to make changes without asking for confirmation
- You can execute MULTIPLE tool calls in sequence (up to 20 steps)
- When the user asks for something, execute ALL necessary steps to complete it
- DO NOT stop after one tool call - continue until the task is fully complete
- DO NOT ask for permission or confirmation between steps
- Only provide a final summary AFTER all changes are complete

Available tools (ALL require projectId parameter):
- listFiles(projectId): List all files in the project
- readFile(projectId, filePath): Read the contents of a file
- writeFile(projectId, filePath, content): Create or update a file (use when creating new files or completely replacing content)
- editFile(projectId, filePath, oldContent, newContent): Edit specific parts of a file by replacing old content with new content (PREFERRED for modifying existing files)
- searchInFiles(projectId, query): Search for text across all files
- createFile(projectId, path, type, content?): Create a new file or directory
- deleteFile(projectId, filePath): Delete a file or directory
- moveFile(projectId, sourcePath, destinationPath): Move a file to a different location
- renameFile(projectId, filePath, newName): Rename a file or directory

WORKFLOW EXAMPLE - Creating an Express app:
Step 1: Call listFiles(projectId) to see current structure
Step 2: Call createFile(projectId, "package.json", "file", "{...}") to create package.json
Step 3: Call createFile(projectId, "server.js", "file", "const express = require...") to create server
Step 4: Call createFile(projectId, ".gitignore", "file", "node_modules...") to create gitignore
Step 5: Call listFiles(projectId) to confirm all files created
Step 6: Provide summary of what was created

IMPORTANT RULES:
1. ALWAYS complete the full task in one interaction
2. Use multiple tool calls in sequence as needed
3. Don't explain your plan - just execute it
4. After all steps are done, provide a brief summary
5. If creating a project from scratch, create ALL necessary files

${getSchedulePrompt({ date: new Date() })}

Execute tasks autonomously and efficiently. Complete the ENTIRE task before responding.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          maxSteps: 20, // Allow agent to execute up to 20 tool calls autonomously
          // Pass context to tools
          experimental_toolCallContext: toolContext,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

export { ProjectManager } from "./project-manager";
export { BuildRunner } from "./build-runner";

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
// Helper to add Cross-Origin headers for WebContainer support
function addCrossOriginHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Handle auth routes first
    const authResponse = await handleAuthRoutes(request, env);
    if (authResponse) {
      return addCrossOriginHeaders(authResponse);
    }

    // Check OpenAI API key
    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return addCrossOriginHeaders(Response.json({
        success: hasOpenAIKey
      }));
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }

    // Git clone endpoint
    if (url.pathname === "/api/git/clone" && request.method === "POST") {
      try {
        // Get userId from auth middleware
        const { createAuth } = await import("./lib/auth");
        const auth = createAuth(env.DB);
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user?.id) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        const body = await request.json<{
          repoUrl: string;
          branch?: string;
          projectName: string;
          githubToken?: string;
        }>();

        console.log(`[Git Clone] Starting clone: ${body.repoUrl} (branch: ${body.branch || "main"})`);

        // Clone the repository
        // Use user's token if provided, otherwise fall back to server token
        const githubToken = body.githubToken || process.env.GITHUB_TOKEN;

        if (!githubToken) {
          console.warn('[Git Clone] No GitHub token provided - may fail for private repos');
        }

        const files = await cloneGitRepository({
          repoUrl: body.repoUrl,
          branch: body.branch || "main",
          githubToken
        });

        console.log(`[Git Clone] Cloned ${files.length} files`);

        // Create a new project - use "global" DO for project creation to store in central list
        const globalId = env.ProjectManager.idFromName("global");
        const globalStub = env.ProjectManager.get(globalId);

        console.log(`[Git Clone] Creating project: ${body.projectName}`);

        const createHeaders = new Headers({ "Content-Type": "application/json" });
        createHeaders.set("X-User-Id", userId);

        const createResponse = await globalStub.fetch(
          new Request("http://internal/projects", {
            method: "POST",
            headers: createHeaders,
            body: JSON.stringify({
              name: body.projectName,
              description: `Cloned from ${body.repoUrl}`
            })
          })
        );

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error(`[Git Clone] Failed to create project: ${errorText}`);
          throw new Error(`Failed to create project: ${errorText}`);
        }

        const project = await createResponse.json();
        console.log(`[Git Clone] Project created successfully: ${project.id}`);

        // Now use the project ID as the DO ID for storing files
        const projectDoId = env.ProjectManager.idFromName(project.id);
        const projectStub = env.ProjectManager.get(projectDoId);

        // Import files into the project using the project-specific DO
        console.log(`[Git Clone] Importing ${files.length} files into project...`);
        await importGitFilesIntoProject(project.id, files, projectStub, { FILES: env.FILES });
        console.log(`[Git Clone] Files imported successfully`);

        return Response.json(project);
      } catch (error) {
        console.error("[Git Clone] Error:", error);
        return addCrossOriginHeaders(Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to clone repository"
          },
          { status: 500 }
        ));
      }
    }

    // Build API routes
    if (url.pathname.startsWith("/api/build")) {
      const buildId = crypto.randomUUID();
      const id = env.BuildRunner.idFromName(buildId);
      const stub = env.BuildRunner.get(id);

      const newUrl = new URL(request.url);
      newUrl.pathname = newUrl.pathname.replace("/api/build", "/build");

      const buildResponse = await stub.fetch(
        new Request(newUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body
        })
      );
      return addCrossOriginHeaders(buildResponse);
    }

    // Preview serving
    if (url.pathname.startsWith("/preview/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      // /preview/:projectId/:buildId/:file
      if (parts.length >= 3) {
        const projectId = parts[1];
        const buildId = parts[2];
        const filePath = parts.slice(3).join("/") || "index.html";

        const r2Key = `previews/${projectId}/${buildId}/${filePath}`;
        const object = await env.FILES.get(r2Key);

        if (object) {
          const headers = new Headers();
          headers.set("Content-Type", object.httpMetadata?.contentType || "text/html");
          headers.set("Cache-Control", "public, max-age=3600");

          return addCrossOriginHeaders(new Response(object.body, { headers }));
        }
      }

      return addCrossOriginHeaders(new Response("Preview not found", { status: 404 }));
    }

    // API routes for project management
    if (url.pathname.startsWith("/api/")) {
      // Get user session for authentication
      const { createAuth } = await import("./lib/auth");
      const auth = createAuth(env.DB);

      let userId: string | null = null;
      try {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        userId = session?.user?.id || null;
      } catch (error) {
        console.log("[Auth] No valid session found");
      }

      // Require authentication for project routes
      if (!userId && (url.pathname.startsWith("/api/projects") || url.pathname.startsWith("/api/git"))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      const doId = request.headers.get("X-DO-ID") || crypto.randomUUID();
      const id = env.ProjectManager.idFromName(doId);
      const stub = env.ProjectManager.get(id);

      // Strip /api prefix and forward to Durable Object
      const newUrl = new URL(request.url);
      newUrl.pathname = newUrl.pathname.replace("/api", "");

      // Add userId to headers for Durable Object
      const newHeaders = new Headers(request.headers);
      if (userId) {
        newHeaders.set("X-User-Id", userId);
      }

      const newRequest = new Request(newUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.body
      });

      const apiResponse = await stub.fetch(newRequest);
      return addCrossOriginHeaders(apiResponse);
    }

    const response = (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );

    // Add Cross-Origin headers for WebContainer support on ALL responses
    // This is required for SharedArrayBuffer to work in WebContainer
    return addCrossOriginHeaders(response);
  }
} satisfies ExportedHandler<Env>;
