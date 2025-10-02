import { DurableObject } from "cloudflare:workers";

export interface Project {
  id: string;
  name: string;
  description?: string;
  user_id: string;
  created_at: number;
  updated_at: number;
}

export interface FileNode {
  id: string;
  project_id: string;
  path: string;
  name: string;
  type: "file" | "directory";
  parent_path: string | null;
  size: number;
  created_at: number;
  updated_at: number;
  content?: string;  // Optional content for creating files
}

export class ProjectManager extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;

    // Initialize tables
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Migration: Add user_id column if it doesn't exist
    try {
      // Try to add the column
      this.sql.exec(`ALTER TABLE projects ADD COLUMN user_id TEXT`);
      console.log('[ProjectManager] Added user_id column to projects table');
    } catch (error) {
      // Column already exists or table doesn't exist yet, ignore
      console.log('[ProjectManager] user_id column already exists or migration not needed');
    }

    // Update existing projects without user_id to have a default user
    try {
      this.sql.exec(`UPDATE projects SET user_id = 'anonymous' WHERE user_id IS NULL`);
    } catch (error) {
      console.log('[ProjectManager] No projects to update');
    }

    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)`);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_path TEXT,
        size INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, path)
      )
    `);

    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_files_parent_path ON files(parent_path)`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Get userId from header (set by auth middleware in server.ts)
    const userId = request.headers.get("X-User-Id");

    try {
      if (path === "/projects" && request.method === "GET") {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }
        return this.getProjects(userId);
      }

      if (path === "/projects" && request.method === "POST") {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }
        const data = await request.json<{ name: string; description?: string }>();
        return this.createProject(data, userId);
      }

      // Check /files routes first (more specific)
      if (path.startsWith("/projects/") && path.endsWith("/files") && request.method === "GET") {
        const projectId = path.split("/")[2];
        return this.getFileTree(projectId);
      }

      // Then check individual project route
      if (path.startsWith("/projects/") && !path.includes("/files") && request.method === "GET") {
        const projectId = path.split("/")[2];
        return this.getProject(projectId);
      }

      if (path.startsWith("/projects/") && path.includes("/files/") && request.method === "GET") {
        const parts = path.split("/files/");
        const projectId = parts[0].split("/")[2];
        const filePath = parts[1];
        return this.getFile(projectId, filePath);
      }

      if (path.startsWith("/projects/") && path.endsWith("/files") && request.method === "POST") {
        const projectId = path.split("/")[2];
        const data = await request.json<FileNode>();
        return this.createFile(projectId, data);
      }

      if (path.startsWith("/projects/") && path.includes("/files/") && request.method === "PUT") {
        const parts = path.split("/files/");
        const projectId = parts[0].split("/")[2];
        const filePath = parts[1];
        const data = await request.json<{ content: string }>();
        return this.updateFile(projectId, filePath, data.content);
      }

      if (path.startsWith("/projects/") && path.includes("/files/") && request.method === "DELETE") {
        const parts = path.split("/files/");
        const projectId = parts[0].split("/")[2];
        const filePath = parts[1];
        return this.deleteFile(projectId, filePath);
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("ProjectManager error:", error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private async getProjects(userId: string): Promise<Response> {
    const projects = this.sql.exec<Project>(
      "SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
      userId
    );
    return Response.json(projects.toArray());
  }

  private async createProject(data: { name: string; description?: string }, userId: string): Promise<Response> {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.sql.exec(
      "INSERT INTO projects (id, name, description, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      data.name,
      data.description || null,
      userId,
      now,
      now
    );

    const project = this.sql.exec<Project>("SELECT * FROM projects WHERE id = ?", id).toArray()[0];
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }
    return Response.json(project);
  }

  private async getProject(projectId: string): Promise<Response> {
    const project = this.sql.exec<Project>("SELECT * FROM projects WHERE id = ?", projectId).toArray()[0];

    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    return Response.json(project);
  }

  private async getFileTree(projectId: string): Promise<Response> {
    const files = this.sql.exec<FileNode>(
      "SELECT * FROM files WHERE project_id = ? ORDER BY type DESC, name ASC",
      projectId
    );

    return Response.json(files.toArray());
  }

  private async getFile(projectId: string, filePath: string): Promise<Response> {
    console.log(`[GetFile] projectId: ${projectId}, filePath: ${filePath}`);

    const file = this.sql.exec<FileNode>(
      "SELECT * FROM files WHERE project_id = ? AND path = ?",
      projectId,
      filePath
    ).toArray()[0];

    if (!file) {
      console.log(`[GetFile] File not found in SQL: ${projectId}/${filePath}`);
      return new Response("File not found", { status: 404 });
    }

    console.log(`[GetFile] File found in SQL, fetching from R2...`);

    // Get actual content from R2
    const r2Key = `${projectId}/${filePath}`;
    console.log(`[GetFile] R2 key: ${r2Key}`);
    const object = await this.env.FILES.get(r2Key);

    if (!object) {
      console.log(`[GetFile] File content not found in R2: ${r2Key}`);
      return new Response("File content not found", { status: 404 });
    }

    const content = await object.text();
    console.log(`[GetFile] Content loaded from R2: ${content.length} bytes`);

    return Response.json({
      ...file,
      content
    });
  }

  private async createFile(projectId: string, data: FileNode): Promise<Response> {
    const id = crypto.randomUUID();
    const now = Date.now();

    // Insert file metadata
    this.sql.exec(
      `INSERT INTO files (id, project_id, path, name, type, parent_path, size, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      projectId,
      data.path,
      data.name,
      data.type,
      data.parent_path || null,
      data.size || 0,
      now,
      now
    );

    // Create file in R2 with content (only for files, not directories)
    if (data.type === "file") {
      const r2Key = `${projectId}/${data.path}`;
      const content = data.content || "";  // Use provided content or empty string
      console.log(`[CreateFile] Uploading to R2: ${r2Key} (${content.length} bytes)`);
      await this.env.FILES.put(r2Key, content);
    }

    // Update project's updated_at
    this.sql.exec("UPDATE projects SET updated_at = ? WHERE id = ?", now, projectId);

    const file = this.sql.exec<FileNode>("SELECT * FROM files WHERE id = ?", id).toArray()[0];
    if (!file) {
      return new Response("File not found after creation", { status: 500 });
    }
    return Response.json(file);
  }

  private async updateFile(projectId: string, filePath: string, content: string): Promise<Response> {
    const file = this.sql.exec<FileNode>(
      "SELECT * FROM files WHERE project_id = ? AND path = ?",
      projectId,
      filePath
    ).toArray()[0];

    if (!file) {
      return new Response("File not found", { status: 404 });
    }

    // Store content in R2
    const r2Key = `${projectId}/${filePath}`;
    await this.env.FILES.put(r2Key, content);

    // Update metadata
    const now = Date.now();
    const size = new TextEncoder().encode(content).length;

    this.sql.exec(
      "UPDATE files SET size = ?, updated_at = ? WHERE id = ?",
      size,
      now,
      file.id
    );

    this.sql.exec("UPDATE projects SET updated_at = ? WHERE id = ?", now, projectId);

    const updatedFile = this.sql.exec<FileNode>("SELECT * FROM files WHERE id = ?", file.id).toArray()[0];

    return Response.json({
      ...updatedFile,
      content
    });
  }

  private async deleteFile(projectId: string, filePath: string): Promise<Response> {
    const file = this.sql.exec<FileNode>(
      "SELECT * FROM files WHERE project_id = ? AND path = ?",
      projectId,
      filePath
    ).toArray()[0];

    if (!file) {
      return new Response("File not found", { status: 404 });
    }

    // Delete from R2
    const r2Key = `${projectId}/${filePath}`;
    await this.env.FILES.delete(r2Key);

    // Delete metadata
    this.sql.exec("DELETE FROM files WHERE id = ?", file.id);

    // Update project
    this.sql.exec("UPDATE projects SET updated_at = ? WHERE id = ?", Date.now(), projectId);

    return Response.json({ success: true });
  }
}
