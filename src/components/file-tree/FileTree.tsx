import { useState, useRef, useEffect } from "react";
import {
  File,
  Folder,
  FolderOpen,
  Plus,
  FileCode,
  FileText,
  FilePlus,
  FolderPlus,
  Edit2,
  Trash2
} from "lucide-react";
import type { FileNode } from "@/project-manager";

interface FileTreeProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onFileCreate?: (parentPath: string | null, type: "file" | "directory", name: string) => void;
  onFileMove?: (sourcePath: string, destinationPath: string) => void;
  onFileRename?: (filePath: string, newName: string) => void;
  onFileDelete?: (filePath: string) => void;
  selectedFile?: FileNode | null;
}

interface TreeNode extends FileNode {
  children?: TreeNode[];
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return <FileCode size={16} className="text-blue-500" />;
    case "json":
    case "html":
    case "css":
    case "scss":
    case "sass":
      return <FileCode size={16} className="text-green-500" />;
    case "md":
    case "txt":
      return <FileText size={16} className="text-gray-500" />;
    default:
      return <File size={16} className="text-gray-400" />;
  }
};

const buildTree = (files: FileNode[]): TreeNode[] => {
  const tree: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  // Sort: directories first, then alphabetically
  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Build the tree structure
  for (const file of sorted) {
    const node: TreeNode = { ...file, children: [] };
    map.set(file.path, node);

    if (!file.parent_path || file.parent_path === "") {
      tree.push(node);
    } else {
      const parent = map.get(file.parent_path);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        tree.push(node);
      }
    }
  }

  return tree;
};

function TreeItem({
  node,
  level,
  onFileSelect,
  onFileMove,
  onFileRename,
  onFileDelete,
  onFileCreate,
  selectedFile
}: {
  node: TreeNode;
  level: number;
  onFileSelect: (file: FileNode) => void;
  onFileMove?: (sourcePath: string, destinationPath: string) => void;
  onFileRename?: (filePath: string, newName: string) => void;
  onFileDelete?: (filePath: string) => void;
  onFileCreate?: (parentPath: string | null, type: "file" | "directory", name: string) => void;
  selectedFile?: FileNode | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [creatingNew, setCreatingNew] = useState<{ type: "file" | "directory"; name: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const isDirectory = node.type === "directory";
  const isSelected = selectedFile?.id === node.id;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.path);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isDirectory) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (isDirectory && onFileMove) {
      const sourcePath = e.dataTransfer.getData("text/plain");
      if (sourcePath && sourcePath !== node.path) {
        const fileName = sourcePath.split("/").pop() || "";
        const destinationPath = `${node.path}/${fileName}`;
        onFileMove(sourcePath, destinationPath);
      }
    }
  };

  const handleRename = () => {
    if (newName && newName !== node.name && onFileRename) {
      onFileRename(node.path, newName);
      setIsRenaming(false);
    } else {
      setNewName(node.name);
      setIsRenaming(false);
    }
  };

  const handleCreateNew = () => {
    if (creatingNew && creatingNew.name.trim() && onFileCreate) {
      onFileCreate(node.path, creatingNew.type, creatingNew.name.trim());
      setCreatingNew(null);
      setIsOpen(true);
    } else {
      setCreatingNew(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showContextMenu]);

  return (
    <div>
      {isRenaming ? (
        <div
          className="flex items-center gap-2 px-2 py-1.5"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isDirectory ? (
            <FolderOpen size={16} className="text-blue-500 flex-shrink-0" />
          ) : (
            getFileIcon(node.name)
          )}
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setNewName(node.name);
                setIsRenaming(false);
              }
            }}
            className="flex-1 text-sm bg-white dark:bg-neutral-800 border border-blue-500 rounded px-1 outline-none"
            autoFocus
          />
        </div>
      ) : (
        <button
          type="button"
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onContextMenu={handleContextMenu}
          onClick={() => {
            if (isDirectory) {
              setIsOpen(!isOpen);
            } else {
              onFileSelect(node);
            }
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors text-left ${
            isSelected ? "bg-neutral-200 dark:bg-neutral-800" : ""
          } ${isDragOver ? "bg-blue-100 dark:bg-blue-900/30 border-2 border-dashed border-blue-500" : ""}`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isDirectory ? (
            <>
              {isOpen ? (
                <FolderOpen size={16} className="text-blue-500 flex-shrink-0" />
              ) : (
                <Folder size={16} className="text-blue-500 flex-shrink-0" />
              )}
              <span className="text-sm truncate">{node.name}</span>
            </>
          ) : (
            <>
              {getFileIcon(node.name)}
              <span className="text-sm truncate">{node.name}</span>
            </>
          )}
        </button>
      )}

      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md shadow-lg py-1 z-50 min-w-48"
          style={{
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`
          }}
        >
          {isDirectory && (
            <>
              <button
                onClick={() => {
                  setShowContextMenu(false);
                  setCreatingNew({ type: "file", name: "" });
                  setIsOpen(true);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              >
                <FilePlus size={14} />
                New File
              </button>
              <button
                onClick={() => {
                  setShowContextMenu(false);
                  setCreatingNew({ type: "directory", name: "" });
                  setIsOpen(true);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              >
                <FolderPlus size={14} />
                New Folder
              </button>
              <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />
            </>
          )}
          <button
            onClick={() => {
              setShowContextMenu(false);
              setIsRenaming(true);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <Edit2 size={14} />
            Rename
          </button>
          <button
            onClick={() => {
              setShowContextMenu(false);
              if (onFileDelete && confirm(`Delete ${node.name}?`)) {
                onFileDelete(node.path);
              }
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-2"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}

      {isDirectory && isOpen && (
        <div>
          {/* Inline New File/Folder Input */}
          {creatingNew && (
            <div
              className="flex items-center gap-2 px-2 py-1.5"
              style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            >
              {creatingNew.type === "directory" ? (
                <Folder size={16} className="text-blue-500 flex-shrink-0" />
              ) : (
                <File size={16} className="text-gray-400 flex-shrink-0" />
              )}
              <input
                type="text"
                value={creatingNew.name}
                onChange={(e) => setCreatingNew({ ...creatingNew, name: e.target.value })}
                onBlur={handleCreateNew}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateNew();
                  if (e.key === "Escape") setCreatingNew(null);
                }}
                placeholder={creatingNew.type === "directory" ? "folder name" : "filename"}
                className="flex-1 text-sm bg-white dark:bg-neutral-800 border border-blue-500 rounded px-1 outline-none"
                autoFocus
              />
            </div>
          )}

          {/* Children */}
          {node.children && node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
              onFileMove={onFileMove}
              onFileRename={onFileRename}
              onFileDelete={onFileDelete}
              onFileCreate={onFileCreate}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ files, onFileSelect, onFileCreate, onFileMove, onFileRename, onFileDelete, selectedFile }: FileTreeProps) {
  const tree = buildTree(files);
  const [creatingRootFile, setCreatingRootFile] = useState<{ type: "file" | "directory"; name: string } | null>(null);

  const handleCreateRoot = () => {
    if (creatingRootFile && creatingRootFile.name.trim() && onFileCreate) {
      onFileCreate(null, creatingRootFile.type, creatingRootFile.name.trim());
      setCreatingRootFile(null);
    } else {
      setCreatingRootFile(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800">
      <div className="px-3 py-2 border-b border-neutral-300 dark:border-neutral-800 flex items-center justify-between">
        <span className="text-sm font-semibold">Explorer</span>
        {onFileCreate && (
          <button
            type="button"
            onClick={() => setCreatingRootFile({ type: "file", name: "" })}
            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded"
            title="New File"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Root level new file input */}
        {creatingRootFile && (
          <div className="flex items-center gap-2 px-2 py-1.5" style={{ paddingLeft: "8px" }}>
            {creatingRootFile.type === "directory" ? (
              <Folder size={16} className="text-blue-500 flex-shrink-0" />
            ) : (
              <File size={16} className="text-gray-400 flex-shrink-0" />
            )}
            <input
              type="text"
              value={creatingRootFile.name}
              onChange={(e) => setCreatingRootFile({ ...creatingRootFile, name: e.target.value })}
              onBlur={handleCreateRoot}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateRoot();
                if (e.key === "Escape") setCreatingRootFile(null);
              }}
              placeholder={creatingRootFile.type === "directory" ? "folder name" : "filename"}
              className="flex-1 text-sm bg-white dark:bg-neutral-800 border border-blue-500 rounded px-1 outline-none"
              autoFocus
            />
          </div>
        )}

        {tree.length === 0 && !creatingRootFile ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No files yet. Create a new file to get started.
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              level={0}
              onFileSelect={onFileSelect}
              onFileMove={onFileMove}
              onFileRename={onFileRename}
              onFileDelete={onFileDelete}
              onFileCreate={onFileCreate}
              selectedFile={selectedFile}
            />
          ))
        )}
      </div>
    </div>
  );
}
