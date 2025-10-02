import { useState, useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileTree } from "@/components/file-tree/FileTree";
import { CodeEditor } from "@/components/code-editor/CodeEditor";
import { AIChat } from "@/components/ai-chat/AIChat";
import { Terminal } from "@/components/terminal/Terminal";
import { Preview } from "@/components/preview/Preview";
import { FloatingPreview } from "@/components/floating-preview/FloatingPreview";
import { Button } from "@/components/button/Button";
import { Moon, Sun, X, Play, Square, Terminal as TerminalIcon, ChevronDown, LogOut } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import type { FileNode } from "@/project-manager";
import { mountProjectFiles } from "@/lib/webcontainer";

interface IDEProps {
  projectId: string;
  projectName: string;
  onBack?: () => void;
  onProjectChange?: (projectId: string, projectName: string) => void;
}

interface FileWithContent extends FileNode {
  content?: string;
}

interface FileTab extends FileWithContent {
  hasUnsavedChanges?: boolean;
}

interface BuildStatus {
  id: string;
  status: "pending" | "installing" | "building" | "success" | "failed";
  logs: string[];
  previewUrl?: string;
  error?: string;
}

export function IDE({ projectId, projectName, onBack, onProjectChange }: IDEProps) {
  const { data: session } = useSession();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });

  const [files, setFiles] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<FileTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Build & Preview state
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [showFloatingPreview, setShowFloatingPreview] = useState(false);
  const [isFloatingExpanded, setIsFloatingExpanded] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedFile = activeTabIndex >= 0 ? openTabs[activeTabIndex] : null;

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Load projects list
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch("/api/projects");
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    loadProjects();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
    };

    if (showProjectDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProjectDropdown]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (selectedFile?.hasUnsavedChanges) {
          handleSave();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        if (selectedFile) {
          handleCloseTab(activeTabIndex);
        }
      }

      // Ctrl+` to toggle terminal
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setShowTerminal(!showTerminal);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFile, activeTabIndex, showTerminal]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/projects/${projectId}/files`, {
        headers: { "X-DO-ID": projectId }
      });

      if (!response.ok) throw new Error("Failed to load files");

      const data = await response.json<FileNode[]>();
      setFiles(data);

      // Load all file contents for WebContainer
      const filesWithContent: Array<{ path: string; content: string; type: 'file' | 'directory' }> = [];

      for (const file of data) {
        if (file.type === 'directory') {
          filesWithContent.push({
            path: file.path,
            content: '',
            type: 'directory'
          });
        } else {
          try {
            const fileResponse = await fetch(`/api/projects/${projectId}/files/${file.path}`, {
              headers: { "X-DO-ID": projectId }
            });

            if (fileResponse.ok) {
              const fileData = await fileResponse.json<FileWithContent>();
              filesWithContent.push({
                path: file.path,
                content: fileData.content || '',
                type: 'file'
              });
            }
          } catch (err) {
            console.error(`Failed to load content for ${file.path}:`, err);
          }
        }
      }

      // Mount files to WebContainer
      try {
        await mountProjectFiles(projectId, filesWithContent);
        console.log(`Mounted ${filesWithContent.length} files to WebContainer`);
      } catch (err) {
        console.error('Failed to mount files to WebContainer:', err);
      }

    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (file: FileNode) => {
    if (file.type === "directory") return;

    const existingTabIndex = openTabs.findIndex((tab) => tab.id === file.id);
    if (existingTabIndex !== -1) {
      setActiveTabIndex(existingTabIndex);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/projects/${projectId}/files/${file.path}`, {
        headers: { "X-DO-ID": projectId }
      });

      if (!response.ok) throw new Error("Failed to load file");

      const data = await response.json<FileWithContent>();
      const newTab: FileTab = { ...data, hasUnsavedChanges: false };
      setOpenTabs([...openTabs, newTab]);
      setActiveTabIndex(openTabs.length);
    } catch (error) {
      console.error("Failed to load file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentChange = (value: string | undefined) => {
    if (activeTabIndex === -1 || !selectedFile) return;

    const newContent = value || "";
    const hasChanged = newContent !== (selectedFile.content || "");

    const updatedTabs = [...openTabs];
    updatedTabs[activeTabIndex] = {
      ...selectedFile,
      content: newContent,
      hasUnsavedChanges: hasChanged
    };
    setOpenTabs(updatedTabs);
  };

  const handleSave = async () => {
    if (activeTabIndex === -1 || !selectedFile) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/projects/${projectId}/files/${selectedFile.path}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-DO-ID": projectId
        },
        body: JSON.stringify({ content: selectedFile.content })
      });

      if (!response.ok) throw new Error("Failed to save file");

      const updatedTabs = [...openTabs];
      updatedTabs[activeTabIndex] = {
        ...selectedFile,
        hasUnsavedChanges: false
      };
      setOpenTabs(updatedTabs);
      await loadFiles();
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseTab = (index: number) => {
    const tab = openTabs[index];

    if (tab.hasUnsavedChanges) {
      const confirmed = confirm(
        `${tab.name} has unsaved changes. Do you want to close it anyway?`
      );
      if (!confirmed) return;
    }

    const newTabs = openTabs.filter((_, i) => i !== index);
    setOpenTabs(newTabs);

    if (activeTabIndex === index) {
      setActiveTabIndex(index > 0 ? index - 1 : newTabs.length > 0 ? 0 : -1);
    } else if (activeTabIndex > index) {
      setActiveTabIndex(activeTabIndex - 1);
    }
  };

  const handleCreateFile = async (parentPath: string | null, type: "file" | "directory", name: string) => {
    const path = parentPath ? `${parentPath}/${name}` : name;

    try {
      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DO-ID": projectId
        },
        body: JSON.stringify({
          path,
          name,
          type,
          parent_path: parentPath,
          size: 0
        })
      });

      if (!response.ok) throw new Error("Failed to create file");
      await loadFiles();
    } catch (error) {
      console.error("Failed to create file:", error);
    }
  };

  const handleFileDelete = async (filePath: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/files/${filePath}`, {
        method: "DELETE",
        headers: {
          "X-DO-ID": projectId
        }
      });

      if (!response.ok) throw new Error("Failed to delete file");
      await loadFiles();
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const handleFileMove = async (sourcePath: string, destinationPath: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/files/move`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DO-ID": projectId
        },
        body: JSON.stringify({ sourcePath, destinationPath })
      });

      if (!response.ok) throw new Error("Failed to move file");
      await loadFiles();
    } catch (error) {
      console.error("Failed to move file:", error);
    }
  };

  const handleFileRename = async (filePath: string, newName: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/files/rename`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DO-ID": projectId
        },
        body: JSON.stringify({ filePath, newName })
      });

      if (!response.ok) throw new Error("Failed to rename file");
      await loadFiles();
    } catch (error) {
      console.error("Failed to rename file:", error);
    }
  };

  const handleBuild = async () => {
    try {
      setIsBuilding(true);
      setShowTerminal(true);
      setTerminalLogs(["Starting build..."]);

      const response = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          buildCommand: "npm run build",
          installCommand: "npm install"
        })
      });

      if (!response.ok) throw new Error("Failed to start build");

      const build = await response.json<BuildStatus>();
      setBuildStatus(build);

      // Poll for build status
      pollBuildStatus(build.id);
    } catch (error) {
      console.error("Build failed:", error);
      setTerminalLogs(prev => [...prev, `Error: ${error instanceof Error ? error.message : "Build failed"}`]);
      setIsBuilding(false);
    }
  };

  const pollBuildStatus = async (buildId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/build/${buildId}`);
        if (!response.ok) throw new Error("Failed to get build status");

        const build = await response.json<BuildStatus>();
        setBuildStatus(build);
        setTerminalLogs(build.logs);

        if (build.status === "success") {
          clearInterval(interval);
          setIsBuilding(false);
          setShowPreview(true);
        } else if (build.status === "failed") {
          clearInterval(interval);
          setIsBuilding(false);
        }
      } catch (error) {
        console.error("Failed to poll build status:", error);
        clearInterval(interval);
        setIsBuilding(false);
      }
    }, 1000);
  };

  const handleCancelBuild = async () => {
    if (!buildStatus) return;

    try {
      await fetch(`/api/build/${buildStatus.id}`, { method: "DELETE" });
      setIsBuilding(false);
      setTerminalLogs(prev => [...prev, "Build cancelled"]);
    } catch (error) {
      console.error("Failed to cancel build:", error);
    }
  };

  const detectLanguage = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      json: "json",
      html: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      c: "c",
      md: "markdown",
      sql: "sql",
      sh: "shell",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml"
    };
    return languageMap[ext || ""] || "plaintext";
  };

  return (
    <div className="h-screen w-full flex flex-col bg-white dark:bg-[#1e1e1e] overflow-hidden">
      {/* Top Bar */}
      <div className="h-11 bg-neutral-100 dark:bg-[#323233] border-b border-neutral-300 dark:border-[#2b2b2b] flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="text-xs h-7">
              ← Back
            </Button>
          )}

          {/* Project Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <h1 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {projectName}
              </h1>
              <ChevronDown size={14} className="text-neutral-500" />
            </button>

            {showProjectDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                {projects.length === 0 ? (
                  <div className="p-3 text-sm text-neutral-500 text-center">
                    No other projects found
                  </div>
                ) : (
                  <div className="py-1">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          if (onProjectChange && project.id !== projectId) {
                            onProjectChange(project.id, project.name);
                          }
                          setShowProjectDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors ${
                          project.id === projectId
                            ? "bg-neutral-100 dark:bg-neutral-700 font-medium text-[#F48120]"
                            : "text-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isBuilding ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelBuild}
              className="text-xs h-7"
            >
              <Square size={14} className="mr-1" />
              Stop Build
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleBuild}
              className="text-xs h-7"
            >
              <Play size={14} className="mr-1" />
              Build & Preview
            </Button>
          )}

          {selectedFile?.hasUnsavedChanges && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="text-xs h-7"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            shape="square"
            className="h-7 w-7"
            onClick={() => setShowTerminal(!showTerminal)}
            tooltip="Toggle Terminal (Ctrl+`)"
            tooltipSide="bottom"
          >
            <TerminalIcon size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            shape="square"
            className="h-7 w-7"
            onClick={toggleTheme}
            tooltip={theme === "dark" ? "Light mode" : "Dark mode"}
            tooltipSide="bottom"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            shape="square"
            className="h-7 w-7"
            onClick={() => signOut()}
            tooltip="Sign out"
            tooltipSide="bottom"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* File Tree - Left Sidebar */}
          <Panel defaultSize={15} minSize={10} maxSize={30}>
            <FileTree
              files={files}
              onFileSelect={handleFileSelect}
              onFileCreate={handleCreateFile}
              onFileMove={handleFileMove}
              onFileRename={handleFileRename}
              onFileDelete={handleFileDelete}
              selectedFile={selectedFile}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-neutral-300 dark:bg-[#2b2b2b] hover:bg-[#F48120] transition-colors" />

          {/* Center - Editor & Terminal */}
          <Panel defaultSize={showPreview ? 45 : 60} minSize={30}>
            <PanelGroup direction="vertical">
              {/* Editor Area */}
              <Panel defaultSize={showTerminal ? 70 : 100} minSize={30}>
                <div className="h-full flex flex-col">
                  {/* Tabs */}
                  {openTabs.length > 0 && (
                    <div className="h-9 bg-neutral-50 dark:bg-[#252526] border-b border-neutral-300 dark:border-[#2b2b2b] flex items-center overflow-x-auto">
                      {openTabs.map((tab, index) => (
                        <div
                          key={tab.id}
                          className={`h-full flex items-center gap-2 px-3 border-r border-neutral-300 dark:border-[#2b2b2b] cursor-pointer group hover:bg-neutral-100 dark:hover:bg-[#2a2d2e] ${
                            index === activeTabIndex
                              ? "bg-white dark:bg-[#1e1e1e] text-neutral-900 dark:text-white"
                              : "text-neutral-600 dark:text-neutral-400"
                          }`}
                          onClick={() => setActiveTabIndex(index)}
                        >
                          <span className="text-xs truncate max-w-[120px]">{tab.name}</span>
                          {tab.hasUnsavedChanges && (
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseTab(index);
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:bg-neutral-200 dark:hover:bg-[#3e3e42] rounded p-0.5"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Editor */}
                  <div className="flex-1 bg-white dark:bg-[#1e1e1e]">
                    {isLoading ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
                      </div>
                    ) : selectedFile ? (
                      <CodeEditor
                        value={selectedFile.content || ""}
                        language={detectLanguage(selectedFile.name)}
                        onChange={handleContentChange}
                        theme={theme}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            No file selected
                          </p>
                          <p className="text-xs text-neutral-400 dark:text-neutral-500">
                            Select a file from the explorer to start editing
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Terminal */}
              {showTerminal && (
                <>
                  <PanelResizeHandle className="h-1 bg-neutral-300 dark:bg-[#2b2b2b] hover:bg-[#F48120] transition-colors" />
                  <Panel defaultSize={30} minSize={15} maxSize={50}>
                    <Terminal
                      initialMessages={terminalLogs}
                      projectId={projectId}
                      onServerReady={(url) => {
                        setPreviewUrl(url);
                        setShowPreview(true);
                      }}
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Right Side - Preview & AI Chat */}
          <PanelResizeHandle className="w-1 bg-neutral-300 dark:bg-[#2b2b2b] hover:bg-[#F48120] transition-colors" />

          <Panel defaultSize={showPreview ? 25 : 25} minSize={20}>
            <PanelGroup direction="vertical">
              {showPreview && (buildStatus?.previewUrl || previewUrl) && (
                <>
                  <Panel defaultSize={50} minSize={20}>
                    <Preview
                      previewUrl={previewUrl || buildStatus?.previewUrl || ''}
                      projectId={projectId}
                      onClose={() => setShowPreview(false)}
                      onPopout={() => {
                        setIsFloatingExpanded(false);
                        setShowFloatingPreview(true);
                        setShowPreview(false);
                      }}
                      onFullscreen={() => {
                        setIsFloatingExpanded(true);
                        setShowFloatingPreview(true);
                        setShowPreview(false);
                      }}
                    />
                  </Panel>
                  <PanelResizeHandle className="h-1 bg-neutral-300 dark:bg-[#2b2b2b] hover:bg-[#F48120] transition-colors" />
                </>
              )}

              <Panel defaultSize={showPreview ? 50 : 100}>
                <AIChat
                  projectId={projectId}
                  currentFile={selectedFile?.path || null}
                  onFilesChanged={loadFiles}
                />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Floating Preview Window */}
      {showFloatingPreview && (previewUrl || buildStatus?.previewUrl) && (
        <FloatingPreview
          previewUrl={previewUrl || buildStatus?.previewUrl || ''}
          onClose={() => {
            setShowFloatingPreview(false);
            setIsFloatingExpanded(false);
          }}
          initialExpanded={isFloatingExpanded}
        />
      )}
    </div>
  );
}
