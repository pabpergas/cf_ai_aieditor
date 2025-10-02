import { tool } from "ai";
import { z } from "zod";
import type { ToolSet } from "ai";
import type { Env } from "./types";

/**
 * Tools for AI to interact with code files
 * These tools allow the AI assistant to read, write, and search code
 */
export const createCodeTools = (env: Env) => ({
  readFile: tool({
    description: "Read the contents of a file in the current project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      filePath: z.string().describe("The path to the file to read")
    }),
    execute: async ({ projectId, filePath }) => {
      console.log('[readFile] ProjectId:', projectId);
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        // Get file from R2
        const r2Key = `${projectId}/${filePath}`;
        const object = await env.FILES.get(r2Key);

        if (!object) {
          return {
            success: false,
            error: "File not found"
          };
        }

        const content = await object.text();

        return {
          success: true,
          filePath,
          content
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to read file"
        };
      }
    }
  }),

  writeFile: tool({
    description:
      "Write or update the contents of a file in the current project. This will create the file if it doesn't exist.",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      filePath: z.string().describe("The path to the file to write"),
      content: z.string().describe("The content to write to the file")
    }),
    execute: async ({ projectId, filePath, content }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        // Store in R2
        const r2Key = `${projectId}/${filePath}`;
        await env.FILES.put(r2Key, content);

        // Get or create Durable Object for project management
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        // Update metadata
        const response = await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${filePath}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: filePath,
              name: filePath.split("/").pop(),
              content
            })
          })
        );

        if (!response.ok) {
          throw new Error(`Failed to update file metadata: ${response.statusText}`);
        }

        return {
          success: true,
          filePath,
          message: "File written successfully"
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to write file"
        };
      }
    }
  }),

  searchInFiles: tool({
    description: "Search for text in all files of the current project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      query: z.string().describe("The text to search for")
    }),
    execute: async ({ projectId, query }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        // Get all files for the project
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        const filesResponse = await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files`, {
            method: "GET"
          })
        );

        if (!filesResponse.ok) {
          throw new Error("Failed to get files");
        }

        const files = await filesResponse.json<
          Array<{ path: string; type: string }>
        >();

        // Search in each file
        const results: Array<{
          file: string;
          matches: Array<{ line: number; text: string }>;
        }> = [];

        for (const file of files) {
          if (file.type === "directory") continue;

          const r2Key = `${projectId}/${file.path}`;
          const object = await env.FILES.get(r2Key);

          if (!object) continue;

          const content = await object.text();
          const lines = content.split("\n");

          const matches: Array<{ line: number; text: string }> = [];

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                line: i + 1,
                text: lines[i].trim()
              });
            }
          }

          if (matches.length > 0) {
            results.push({
              file: file.path,
              matches
            });
          }
        }

        return {
          success: true,
          query,
          results,
          totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0)
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed"
        };
      }
    }
  }),

  listFiles: tool({
    description: "List all files and directories in the current project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project")
    }),
    execute: async ({ projectId }) => {
      console.log('[listFiles] ProjectId:', projectId);
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        const response = await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files`, {
            method: "GET"
          })
        );

        if (!response.ok) {
          throw new Error("Failed to get files");
        }

        const files = await response.json<
          Array<{
            path: string;
            name: string;
            type: string;
            size: number;
          }>
        >();

        return {
          success: true,
          files: files.map((f: any) => ({
            path: f.path,
            name: f.name,
            type: f.type,
            size: f.size
          }))
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to list files"
        };
      }
    }
  }),

  createFile: tool({
    description: "Create a new file or directory in the project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      path: z.string().describe("The path for the new file or directory"),
      type: z.enum(["file", "directory"]).describe("Whether to create a file or directory"),
      content: z.string().optional().describe("Initial content for files (ignored for directories)")
    }),
    execute: async ({ projectId, path, type, content = "" }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        // Create file metadata
        const parentPath = path.split("/").slice(0, -1).join("/") || null;
        const name = path.split("/").pop() || path;

        const response = await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path,
              name,
              type,
              parent_path: parentPath,
              size: type === "file" ? content.length : 0
            })
          })
        );

        if (!response.ok) {
          throw new Error("Failed to create file");
        }

        // If it's a file, store content in R2
        if (type === "file") {
          const r2Key = `${projectId}/${path}`;
          await env.FILES.put(r2Key, content);
        }

        return {
          success: true,
          path,
          type,
          message: `${type === "file" ? "File" : "Directory"} created successfully`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create file"
        };
      }
    }
  }),

  deleteFile: tool({
    description: "Delete a file or directory from the project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      filePath: z.string().describe("The path to the file or directory to delete")
    }),
    execute: async ({ projectId, filePath }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        const response = await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${filePath}`, {
            method: "DELETE"
          })
        );

        if (!response.ok) {
          throw new Error("Failed to delete file");
        }

        return {
          success: true,
          filePath,
          message: "File deleted successfully"
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete file"
        };
      }
    }
  }),

  moveFile: tool({
    description: "Move a file or directory to a different location in the project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      sourcePath: z.string().describe("The current path of the file or directory"),
      destinationPath: z.string().describe("The new path where the file or directory should be moved")
    }),
    execute: async ({ projectId, sourcePath, destinationPath }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        // Read the source file from R2
        const sourceKey = `${projectId}/${sourcePath}`;
        const sourceObject = await env.FILES.get(sourceKey);

        if (!sourceObject) {
          return {
            success: false,
            error: "Source file not found"
          };
        }

        const content = await sourceObject.text();

        // Write to new location
        const destKey = `${projectId}/${destinationPath}`;
        await env.FILES.put(destKey, content);

        // Delete from old location
        await env.FILES.delete(sourceKey);

        // Update metadata in Durable Object
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        // Delete old file metadata
        await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${sourcePath}`, {
            method: "DELETE"
          })
        );

        // Create new file metadata
        await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${destinationPath}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: destinationPath,
              name: destinationPath.split("/").pop(),
              content
            })
          })
        );

        return {
          success: true,
          sourcePath,
          destinationPath,
          message: `File moved from ${sourcePath} to ${destinationPath}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to move file"
        };
      }
    }
  }),

  renameFile: tool({
    description: "Rename a file or directory in the project",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      filePath: z.string().describe("The current path of the file or directory"),
      newName: z.string().describe("The new name for the file or directory")
    }),
    execute: async ({ projectId, filePath, newName }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        // Calculate new path
        const pathParts = filePath.split("/");
        pathParts[pathParts.length - 1] = newName;
        const newPath = pathParts.join("/");

        // Read the source file from R2
        const sourceKey = `${projectId}/${filePath}`;
        const sourceObject = await env.FILES.get(sourceKey);

        if (!sourceObject) {
          return {
            success: false,
            error: "File not found"
          };
        }

        const content = await sourceObject.text();

        // Write to new location
        const destKey = `${projectId}/${newPath}`;
        await env.FILES.put(destKey, content);

        // Delete from old location
        await env.FILES.delete(sourceKey);

        // Update metadata in Durable Object
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        // Delete old file metadata
        await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${filePath}`, {
            method: "DELETE"
          })
        );

        // Create new file metadata
        await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${newPath}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: newPath,
              name: newName,
              content
            })
          })
        );

        return {
          success: true,
          oldPath: filePath,
          newPath,
          message: `File renamed from ${filePath} to ${newPath}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to rename file"
        };
      }
    }
  }),

  editFile: tool({
    description: "Edit specific parts of a file by replacing old content with new content. Use this instead of writeFile when you only need to modify a section.",
    inputSchema: z.object({
      projectId: z.string().describe("The ID of the current project"),
      filePath: z.string().describe("The path to the file to edit"),
      oldContent: z.string().describe("The exact content to be replaced (must match exactly including whitespace)"),
      newContent: z.string().describe("The new content to replace the old content with")
    }),
    execute: async ({ projectId, filePath, oldContent, newContent }) => {
      if (!projectId) {
        return {
          success: false,
          error: "No project context available"
        };
      }
      try {
        // Read current file content
        const r2Key = `${projectId}/${filePath}`;
        const object = await env.FILES.get(r2Key);

        if (!object) {
          return {
            success: false,
            error: "File not found"
          };
        }

        const currentContent = await object.text();

        // Check if old content exists in file
        if (!currentContent.includes(oldContent)) {
          return {
            success: false,
            error: "Old content not found in file. Make sure the content matches exactly."
          };
        }

        // Replace old content with new content
        const updatedContent = currentContent.replace(oldContent, newContent);

        // Store updated content in R2
        await env.FILES.put(r2Key, updatedContent);

        // Update metadata
        const id = env.ProjectManager.idFromName(projectId);
        const stub = env.ProjectManager.get(id);

        const response = await stub.fetch(
          new Request(`https://dummy/projects/${projectId}/files/${filePath}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: filePath,
              name: filePath.split("/").pop(),
              content: updatedContent
            })
          })
        );

        if (!response.ok) {
          throw new Error(`Failed to update file metadata: ${response.statusText}`);
        }

        return {
          success: true,
          filePath,
          message: "File edited successfully"
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to edit file"
        };
      }
    }
  })
}) satisfies (env: Env) => ToolSet;

/**
 * Execution handlers for tools that require human confirmation
 * Currently all code tools execute automatically
 */
export const codeExecutions = {} as const;
