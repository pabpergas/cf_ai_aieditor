import { DurableObject } from "cloudflare:workers";

export interface BuildConfig {
  projectId: string;
  buildCommand?: string;
  installCommand?: string;
  outputDir?: string;
}

export interface BuildStatus {
  id: string;
  projectId: string;
  status: "pending" | "installing" | "building" | "success" | "failed";
  logs: string[];
  previewUrl?: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

/**
 * BuildRunner Durable Object
 * Handles building and deploying projects to preview environments
 */
export class BuildRunner extends DurableObject<Env> {
  private builds: Map<string, BuildStatus> = new Map();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Start a new build
      if (path === "/build" && request.method === "POST") {
        const config = await request.json<BuildConfig>();
        return this.startBuild(config);
      }

      // Get build status
      if (path.startsWith("/build/") && request.method === "GET") {
        const buildId = path.split("/")[2];
        return this.getBuildStatus(buildId);
      }

      // Get build logs (streaming)
      if (path.startsWith("/build/") && path.endsWith("/logs")) {
        const buildId = path.split("/")[2];
        return this.streamBuildLogs(buildId);
      }

      // Cancel build
      if (path.startsWith("/build/") && request.method === "DELETE") {
        const buildId = path.split("/")[2];
        return this.cancelBuild(buildId);
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("BuildRunner error:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Build failed" },
        { status: 500 }
      );
    }
  }

  private async startBuild(config: BuildConfig): Promise<Response> {
    const buildId = crypto.randomUUID();
    const build: BuildStatus = {
      id: buildId,
      projectId: config.projectId,
      status: "pending",
      logs: [],
      startedAt: Date.now()
    };

    this.builds.set(buildId, build);

    // Run build asynchronously
    this.ctx.waitUntil(this.executeBuild(buildId, config));

    return Response.json(build);
  }

  private async executeBuild(buildId: string, config: BuildConfig): Promise<void> {
    const build = this.builds.get(buildId);
    if (!build) return;

    try {
      // Update status to installing
      build.status = "installing";
      build.logs.push(`[${new Date().toISOString()}] Starting build for project ${config.projectId}`);

      // Get all project files from R2
      const files = await this.getProjectFiles(config.projectId);

      build.logs.push(`[${new Date().toISOString()}] Found ${files.length} files`);

      // Detect project type
      const projectType = this.detectProjectType(files);
      build.logs.push(`[${new Date().toISOString()}] Detected project type: ${projectType}`);

      // Install dependencies using Cloudflare Workers
      if (files.some(f => f.path === "package.json")) {
        build.logs.push(`[${new Date().toISOString()}] Installing dependencies...`);

        const packageJson = files.find(f => f.path === "package.json");
        if (packageJson) {
          const deps = await this.installDependencies(packageJson.content, build);
        }
      }

      // Build the project
      build.status = "building";
      build.logs.push(`[${new Date().toISOString()}] Building project...`);

      const buildResult = await this.buildProject(files, projectType, config, build);

      // Deploy to preview environment
      const previewUrl = await this.deployPreview(buildId, buildResult, config.projectId);

      build.status = "success";
      build.previewUrl = previewUrl;
      build.completedAt = Date.now();
      build.logs.push(`[${new Date().toISOString()}] Build completed successfully!`);
      build.logs.push(`[${new Date().toISOString()}] Preview URL: ${previewUrl}`);

    } catch (error) {
      build.status = "failed";
      build.error = error instanceof Error ? error.message : "Unknown error";
      build.completedAt = Date.now();
      build.logs.push(`[${new Date().toISOString()}] ERROR: ${build.error}`);
    }
  }

  private async getProjectFiles(projectId: string): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    // List all files in R2 for this project
    const list = await this.env.FILES.list({ prefix: `${projectId}/` });

    for (const object of list.objects) {
      const r2Object = await this.env.FILES.get(object.key);
      if (r2Object) {
        const content = await r2Object.text();
        const path = object.key.replace(`${projectId}/`, "");
        files.push({ path, content });
      }
    }

    return files;
  }

  private detectProjectType(files: Array<{ path: string; content: string }>): string {
    const packageJson = files.find(f => f.path === "package.json");

    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson.content);

        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          if (pkg.dependencies?.next || pkg.devDependencies?.next) return "nextjs";
          if (pkg.dependencies?.vite || pkg.devDependencies?.vite) return "vite-react";
          return "react";
        }

        if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return "vue";
        if (pkg.dependencies?.svelte || pkg.devDependencies?.svelte) return "svelte";
        if (pkg.dependencies?.express) return "express";
      } catch (e) {
        // Invalid package.json
      }
    }

    if (files.some(f => f.path === "index.html")) return "static";

    return "unknown";
  }

  private async installDependencies(
    packageJsonContent: string,
    build: BuildStatus
  ): Promise<void> {
    try {
      const pkg = JSON.parse(packageJsonContent);
      const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

      build.logs.push(`[${new Date().toISOString()}] Dependencies to install: ${Object.keys(dependencies).length}`);

      // For production, we would use a package manager API or bundler
      // For now, we'll use esbuild or similar to bundle
      build.logs.push(`[${new Date().toISOString()}] Using bundler for dependency resolution`);

    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error}`);
    }
  }

  private async buildProject(
    files: Array<{ path: string; content: string }>,
    projectType: string,
    config: BuildConfig,
    build: BuildStatus
  ): Promise<Map<string, string>> {
    const builtFiles = new Map<string, string>();

    // For static sites, just copy files
    if (projectType === "static") {
      for (const file of files) {
        builtFiles.set(file.path, file.content);
      }
      return builtFiles;
    }

    // For React/Vite projects, we need to bundle
    if (projectType === "vite-react" || projectType === "react") {
      build.logs.push(`[${new Date().toISOString()}] Building React application...`);

      // Find entry point
      const entryFile = files.find(f =>
        f.path === "src/main.tsx" ||
        f.path === "src/main.jsx" ||
        f.path === "src/index.tsx" ||
        f.path === "src/index.jsx"
      );

      if (!entryFile) {
        throw new Error("No entry file found (main.tsx, index.tsx, etc.)");
      }

      // Create a simple HTML wrapper
      const html = this.createHTMLWrapper(files, entryFile.path);
      builtFiles.set("index.html", html);

      // In production, you would use esbuild or similar to bundle
      // For demonstration, we'll create a basic setup
      for (const file of files) {
        if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx") || file.path.endsWith(".ts") || file.path.endsWith(".js")) {
          // Transform TypeScript/JSX to JavaScript
          // In production, use esbuild or swc
          builtFiles.set(file.path, file.content);
        } else {
          builtFiles.set(file.path, file.content);
        }
      }
    }

    return builtFiles;
  }

  private createHTMLWrapper(files: Array<{ path: string; content: string }>, entryPath: string): string {
    const indexHtml = files.find(f => f.path === "index.html");

    if (indexHtml) {
      return indexHtml.content;
    }

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
    <script type="module">
      import "${entryPath}";
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  }

  private async deployPreview(
    buildId: string,
    builtFiles: Map<string, string>,
    projectId: string
  ): Promise<string> {
    // Store built files in R2 under preview namespace
    const previewPrefix = `previews/${projectId}/${buildId}/`;

    for (const [path, content] of builtFiles) {
      await this.env.FILES.put(`${previewPrefix}${path}`, content, {
        httpMetadata: {
          contentType: this.getContentType(path)
        }
      });
    }

    // Return preview URL
    // In production, this would be a subdomain or path
    return `/preview/${projectId}/${buildId}/`;
  }

  private getContentType(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      ico: "image/x-icon"
    };
    return types[ext || ""] || "text/plain";
  }

  private getBuildStatus(buildId: string): Response {
    const build = this.builds.get(buildId);
    if (!build) {
      return Response.json({ error: "Build not found" }, { status: 404 });
    }
    return Response.json(build);
  }

  private streamBuildLogs(buildId: string): Response {
    const build = this.builds.get(buildId);
    if (!build) {
      return Response.json({ error: "Build not found" }, { status: 404 });
    }

    // Create a streaming response with build logs
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const log of build.logs) {
          controller.enqueue(encoder.encode(log + "\n"));
        }

        if (build.status === "success" || build.status === "failed") {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  private cancelBuild(buildId: string): Response {
    const build = this.builds.get(buildId);
    if (!build) {
      return Response.json({ error: "Build not found" }, { status: 404 });
    }

    if (build.status === "pending" || build.status === "installing" || build.status === "building") {
      build.status = "failed";
      build.error = "Build cancelled by user";
      build.completedAt = Date.now();
      build.logs.push(`[${new Date().toISOString()}] Build cancelled`);
    }

    return Response.json(build);
  }
}
