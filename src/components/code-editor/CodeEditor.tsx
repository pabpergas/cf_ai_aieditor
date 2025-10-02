import { useEffect, useRef } from "react";
import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  theme?: "light" | "dark";
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  language = "javascript",
  onChange,
  theme = "dark",
  readOnly = false
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Configure editor options
    editor.updateOptions({
      fontSize: 14,
      minimap: { enabled: true },
      lineNumbers: "on",
      rulers: [80, 120],
      scrollBeyondLastLine: false,
      wordWrap: "on",
      automaticLayout: true,
      tabSize: 2,
      readOnly
    });
  };

  const handleEditorChange: OnChange = (value) => {
    onChange?.(value);
  };

  // Detect language from file extension
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
      bash: "shell",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      toml: "toml"
    };

    return languageMap[ext || ""] || "plaintext";
  };

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage={language}
        language={language}
        value={value}
        theme={theme === "dark" ? "vs-dark" : "vs-light"}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          automaticLayout: true
        }}
      />
    </div>
  );
}
