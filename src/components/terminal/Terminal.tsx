import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getWebContainer } from "@/lib/webcontainer";

interface TerminalProps {
  onCommand?: (command: string) => void;
  initialMessages?: string[];
  className?: string;
  projectId?: string;
  onServerReady?: (url: string) => void;
}

export function Terminal({ onCommand, initialMessages = [], className = "", projectId, onServerReady }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    let jsh: any = null;

    const initTerminal = async () => {
      // Create terminal instance
      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        theme: {
          background: "#1e1e1e",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
          black: "#000000",
          red: "#cd3131",
          green: "#0dbc79",
          yellow: "#e5e510",
          blue: "#2472c8",
          magenta: "#bc3fbc",
          cyan: "#11a8cd",
          white: "#e5e5e5",
          brightBlack: "#666666",
          brightRed: "#f14c4c",
          brightGreen: "#23d18b",
          brightYellow: "#f5f543",
          brightBlue: "#3b8eea",
          brightMagenta: "#d670d6",
          brightCyan: "#29b8db",
          brightWhite: "#e5e5e5"
        },
        scrollback: 10000,
        convertEol: true,
        scrollOnUserInput: true,
        allowProposedApi: true
      });

      // Create fit addon
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // Open terminal
      term.open(terminalRef.current!);
      fitAddon.fit();

      // Store refs
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Handle resize
      const handleResize = () => {
        fitAddon.fit();
      };

      window.addEventListener("resize", handleResize);

      // Print initial messages
      if (initialMessages.length > 0) {
        for (const message of initialMessages) {
          term.writeln(message);
        }
      }

      // Initialize WebContainer
      try {
        term.writeln("\x1b[1;33mInitializing WebContainer...\x1b[0m");
        const webcontainer = await getWebContainer();

        // Spawn shell
        jsh = await webcontainer.spawn('jsh');

        // Pipe shell output to terminal
        jsh.output.pipeTo(
          new WritableStream({
            write(data) {
              term.write(data);
            }
          })
        );

        // Pipe terminal input to shell
        const input = jsh.input.getWriter();
        term.onData((data) => {
          input.write(data);
        });

        term.writeln("\x1b[1;32mWebContainer ready!\x1b[0m");
        term.writeln("You can now run commands like 'npm install' or 'npm start'\r\n");

        // Listen for server ready event
        webcontainer.on('server-ready', (port, url) => {
          term.writeln(`\r\n\x1b[1;32m✓ Server ready at: ${url}\x1b[0m\r\n`);
          onServerReady?.(url);
        });

        // Cleanup function
        return () => {
          window.removeEventListener("resize", handleResize);
          input.releaseLock();
          term.dispose();
        };
      } catch (error) {
        term.writeln(`\x1b[1;31mError initializing WebContainer: ${error}\x1b[0m`);
        term.writeln("Falling back to simple terminal\r\n");

        // Fallback to simple terminal
        let currentLine = "";
        term.onData((data) => {
          const char = data;

          if (char === "\r") {
            term.write("\r\n");
            if (currentLine.trim()) {
              onCommand?.(currentLine.trim());
            }
            currentLine = "";
            term.write("$ ");
          } else if (char === "\u007f") {
            if (currentLine.length > 0) {
              currentLine = currentLine.slice(0, -1);
              term.write("\b \b");
            }
          } else if (char === "\u0003") {
            term.write("^C\r\n$ ");
            currentLine = "";
          } else if (char >= String.fromCharCode(0x20) && char <= String.fromCharCode(0x7e)) {
            currentLine += char;
            term.write(char);
          }
        });

        term.write("$ ");

        return () => {
          window.removeEventListener("resize", handleResize);
          term.dispose();
        };
      }
    };

    initTerminal();
  }, [onCommand, projectId]);

  // Public method to write to terminal
  useEffect(() => {
    if (xtermRef.current && initialMessages.length > 0) {
      const latestMessage = initialMessages[initialMessages.length - 1];
      if (latestMessage) {
        xtermRef.current.writeln(latestMessage);
      }
    }
  }, [initialMessages]);

  return (
    <div className={`h-full w-full bg-[#1e1e1e] ${className}`}>
      <div ref={terminalRef} className="h-full w-full p-2" />
    </div>
  );
}

// Export helper to write to terminal
export function useTerminal() {
  const terminalRef = useRef<XTerm | null>(null);

  const write = (text: string) => {
    if (terminalRef.current) {
      terminalRef.current.writeln(text);
    }
  };

  const clear = () => {
    if (terminalRef.current) {
      terminalRef.current.clear();
    }
  };

  return { terminalRef, write, clear };
}
