import { useState, useEffect } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { Label } from "@/components/label/Label";
import { Textarea } from "@/components/textarea/Textarea";
import { FolderOpen, Plus, Code } from "lucide-react";
import type { Project } from "@/project-manager";

interface ProjectSelectorProps {
  onProjectSelect: (project: Project) => void;
}

export function ProjectSelector({ onProjectSelect }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitToken, setGitToken] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      // Use a consistent ID for listing all projects
      const response = await fetch("/api/projects", {
        headers: { "X-DO-ID": "global" }
      });

      if (!response.ok) {
        throw new Error("Failed to load projects");
      }

      const data = await response.json<Project[]>();
      setProjects(data);
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProjectName.trim()) {
      alert("Please enter a project name");
      return;
    }

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DO-ID": "global"
        },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDescription
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create project");
      }

      const project = await response.json<Project>();

      // Reset form
      setNewProjectName("");
      setNewProjectDescription("");
      setShowCreateForm(false);

      // Reload projects
      await loadProjects();

      // Auto-select the new project
      onProjectSelect(project);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert("Failed to create project");
    }
  };

  const handleCloneRepo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gitRepoUrl.trim()) {
      alert("Please enter a repository URL");
      return;
    }

    try {
      setIsCloning(true);

      // Extract project name from repo URL
      const match = gitRepoUrl.match(/\/([^\/]+?)(?:\.git)?$/);
      const projectName = match ? match[1] : "cloned-project";

      const response = await fetch("/api/git/clone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repoUrl: gitRepoUrl,
          branch: gitBranch,
          projectName,
          githubToken: gitToken || undefined
        })
      });

      if (!response.ok) {
        const error = await response.json<{ error: string }>();
        throw new Error(error.error || "Failed to clone repository");
      }

      const project = await response.json<Project>();

      // Reset form
      setGitRepoUrl("");
      setGitBranch("main");
      setGitToken("");
      setShowCloneForm(false);

      // Reload projects
      await loadProjects();

      // Auto-select the new project
      onProjectSelect(project);
    } catch (error) {
      console.error("Failed to clone repository:", error);
      alert(error instanceof Error ? error.message : "Failed to clone repository");
    } finally {
      setIsCloning(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Code size={48} className="text-[#F48120]" />
          </div>
          <h1 className="text-3xl font-bold mb-2">AI Code Editor</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Create or select a project to start coding with AI assistance
          </p>
        </div>

        {showCreateForm && (
          <Card className="p-6 mb-6 bg-white dark:bg-neutral-800">
            <h3 className="text-lg font-semibold mb-4">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="my-awesome-project"
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="projectDescription">Description (optional)</Label>
                <Textarea
                  id="projectDescription"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="A brief description of your project..."
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewProjectName("");
                    setNewProjectDescription("");
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="default">
                  Create Project
                </Button>
              </div>
            </form>
          </Card>
        )}

        {showCloneForm && (
          <Card className="p-6 mb-6 bg-white dark:bg-neutral-800">
            <h3 className="text-lg font-semibold mb-4">Clone Git Repository</h3>
            <form onSubmit={handleCloneRepo} className="space-y-4">
              <div>
                <Label htmlFor="gitRepoUrl">Repository URL</Label>
                <Input
                  id="gitRepoUrl"
                  type="url"
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="gitBranch">Branch (optional)</Label>
                <Input
                  id="gitBranch"
                  type="text"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="gitToken">
                  GitHub Personal Access Token (optional)
                </Label>
                <Input
                  id="gitToken"
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="mt-1"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Required for private repositories.{" "}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#F48120] hover:underline"
                  >
                    Create token
                  </a>
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCloneForm(false);
                    setGitRepoUrl("");
                    setGitBranch("main");
                    setGitToken("");
                  }}
                  disabled={isCloning}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="default" disabled={isCloning}>
                  {isCloning ? "Cloning..." : "Clone Repository"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {!showCreateForm && !showCloneForm && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Button
              onClick={() => setShowCreateForm(true)}
              variant="default"
              className="w-full"
            >
              <Plus size={20} />
              <span>Create New Project</span>
            </Button>
            <Button
              onClick={() => setShowCloneForm(true)}
              variant="outline"
              className="w-full"
            >
              <Code size={20} />
              <span>Clone from Git</span>
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-neutral-500">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-neutral-800">
            <FolderOpen size={48} className="mx-auto mb-4 text-neutral-400" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Create your first project to get started
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="p-6 bg-white dark:bg-neutral-800 hover:border-[#F48120] transition-colors cursor-pointer"
                onClick={() => {
                  console.log("Card clicked, project:", project);
                  onProjectSelect(project);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-[#F48120]/10 rounded-lg">
                    <FolderOpen size={24} className="text-[#F48120]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1 truncate">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500">
                      Updated {formatDate(project.updated_at)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
