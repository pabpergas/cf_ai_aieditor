/**
 * Git clone functionality for importing repositories into projects
 * Uses a worker-based approach to clone repositories from GitHub
 */

export interface GitCloneOptions {
  repoUrl: string;
  branch?: string;
  githubToken?: string;
}

export interface GitFile {
  path: string;
  content: string;
  type: "file" | "directory";
}

/**
 * Clone a GitHub repository and return its file structure
 * This uses the GitHub API to download repository contents
 */
export async function cloneGitRepository(
  options: GitCloneOptions
): Promise<GitFile[]> {
  const { repoUrl, branch = "main", githubToken } = options;

  // Extract owner and repo from URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) {
    throw new Error("Invalid GitHub URL. Expected format: https://github.com/owner/repo");
  }

  const [, owner, repo] = match;

  // Fetch repository tree from GitHub API
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CloudflareAIEditor"
  };

  // Add authentication if token is provided
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository not found or branch '${branch}' doesn't exist`);
    }
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        throw new Error(`GitHub API rate limit exceeded. ${githubToken ? 'Try again later.' : 'Add a GitHub token to increase the limit.'}`);
      }
      throw new Error(`Access forbidden. The repository might be private or you don't have permission.`);
    }
    throw new Error(`Failed to fetch repository: ${response.statusText}`);
  }
  console.log("Response:", response);
  const data = await response.json<{
    tree: Array<{
      path: string;
      type: string;
      size?: number;
      url: string;
    }>;
    truncated: boolean;
  }>();
  console.log("Data:", data);
  if (data.truncated) {
    throw new Error("Repository is too large. Please use a smaller repository or specific branch.");
  }

  // Download file contents
  const files: GitFile[] = [];

  for (const item of data.tree) {
    if (item.type === "tree") {
      // It's a directory
      files.push({
        path: item.path,
        content: "",
        type: "directory"
      });
    } else if (item.type === "blob") {
      // It's a file - download content
      try {
        const fileHeaders: Record<string, string> = {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CloudflareAIEditor"
        };

        if (githubToken) {
          fileHeaders.Authorization = `Bearer ${githubToken}`;
        }

        const fileResponse = await fetch(item.url, { headers: fileHeaders });

        if (fileResponse.ok) {
          const fileData = await fileResponse.json<{
            content: string;
            encoding: string;
          }>();

          // Decode base64 content
          let content = "";
          if (fileData.encoding === "base64") {
            try {
              content = atob(fileData.content.replace(/\n/g, ""));
              console.log(`[Git Clone] Decoded ${item.path}: ${content.length} bytes`);
            } catch (e) {
              console.warn(`Failed to decode ${item.path}, skipping`);
              continue;
            }
          } else {
            console.warn(`[Git Clone] Unexpected encoding for ${item.path}: ${fileData.encoding}`);
          }

          files.push({
            path: item.path,
            content,
            type: "file"
          });
        } else {
          console.warn(`[Git Clone] Failed to fetch ${item.path}: ${fileResponse.status} ${fileResponse.statusText}`);
          // Still add file with empty content so structure is preserved
          files.push({
            path: item.path,
            content: "",
            type: "file"
          });
        }
      } catch (error) {
        console.warn(`Failed to download ${item.path}:`, error);
        // Continue with other files
      }
    }
  }

  return files;
}

/**
 * Import cloned files into a project
 */
export async function importGitFilesIntoProject(
  projectId: string,
  files: GitFile[],
  stub: DurableObjectStub,
  env: { FILES: R2Bucket }
): Promise<void> {
  // First, create all directories
  const directories = files.filter((f) => f.type === "directory");
  for (const dir of directories) {
    const parentPath = dir.path.split("/").slice(0, -1).join("/") || null;
    const name = dir.path.split("/").pop() || dir.path;

    await stub.fetch(
      new Request(`http://internal/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: dir.path,
          name,
          type: "directory",
          parent_path: parentPath,
          size: 0
        })
      })
    );
  }

  // Then create all files - send content in the request so DO can upload to R2
  const regularFiles = files.filter((f) => f.type === "file");
  for (const file of regularFiles) {
    const parentPath = file.path.split("/").slice(0, -1).join("/") || null;
    const name = file.path.split("/").pop() || file.path;

    console.log(`[Git Clone] Creating file with content: ${file.path} (${file.content.length} bytes)`);

    // Create file with content - DO will upload to R2
    await stub.fetch(
      new Request(`http://internal/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: file.path,
          name,
          type: "file",
          parent_path: parentPath,
          size: file.content.length,
          content: file.content  // Send content to DO
        })
      })
    );
  }
}
