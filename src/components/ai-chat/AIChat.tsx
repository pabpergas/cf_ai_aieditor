import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { isToolUIPart } from "ai";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";

import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

import { Bot, Send, Square, Trash2 } from "lucide-react";

interface AIChatProps {
  projectId?: string;
  currentFile?: string | null;
  onToolCall?: (toolName: string, args: unknown) => void;
  onFilesChanged?: () => void;
}

export function AIChat({ projectId, currentFile, onToolCall, onFilesChanged }: AIChatProps) {
  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [lastProjectId, setLastProjectId] = useState<string | undefined>(projectId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const agent = useAgent({
    agent: "chat"
  });

  const [agentInput, setAgentInput] = useState("");

  const handleAgentInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

    // Include context about current project and file
    const context = {
      projectId,
      currentFile,
      ...extraData
    };

    await sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }],
        metadata: {
          projectId,
          currentFile
        }
      },
      {
        body: context
      }
    );
  };

  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  // Clear chat history when switching projects
  useEffect(() => {
    if (projectId && lastProjectId && projectId !== lastProjectId) {
      console.log('[AIChat] Project changed, clearing history');
      clearHistory();
    }
    setLastProjectId(projectId);
  }, [projectId, lastProjectId, clearHistory]);

  // Detect file changes from AI tools and refresh immediately after each tool call
  useEffect(() => {
    if (agentMessages.length > 0) {
      const lastMessage = agentMessages[agentMessages.length - 1];
      if (lastMessage.role === 'assistant') {
        // Check if any file modification tools were used
        const fileTools = ['writeFile', 'createFile', 'deleteFile', 'moveFile', 'renameFile', 'editFile'];

        // Count completed tool calls
        let hasChanges = false;
        for (const part of lastMessage.parts) {
          if (isToolUIPart(part) && fileTools.includes(part.toolName) && part.state === 'output-available') {
            hasChanges = true;
            console.log('[AIChat] File modification detected:', part.toolName, part.output);
            break;
          }
        }

        // Refresh UI immediately after each tool call completion
        if (hasChanges && onFilesChanged) {
          console.log('[AIChat] Triggering file refresh');
          onFilesChanged();
        }
      }
    }
  }, [agentMessages, onFilesChanged]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 border-l border-neutral-300 dark:border-neutral-800">
      <div className="px-3 py-2 border-b border-neutral-300 dark:border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-[#F48120]" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          className="h-7 w-7"
          onClick={clearHistory}
          tooltip="Clear chat history"
          tooltipSide="bottom"
        >
          <Trash2 size={16} />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {agentMessages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <Card className="p-4 max-w-xs mx-auto bg-neutral-100 dark:bg-neutral-900">
              <div className="text-center space-y-3">
                <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-2 inline-flex">
                  <Bot size={20} />
                </div>
                <h3 className="font-semibold text-sm">AI Code Assistant</h3>
                <p className="text-muted-foreground text-xs">
                  Ask me to help with your code. I can:
                </p>
                <ul className="text-xs text-left space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="text-[#F48120]">•</span>
                    <span>Read and analyze files</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#F48120]">•</span>
                    <span>Edit code</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#F48120]">•</span>
                    <span>Search in your project</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#F48120]">•</span>
                    <span>Explain code concepts</span>
                  </li>
                </ul>
              </div>
            </Card>
          </div>
        )}

        {agentMessages.map((m, index) => {
          const isUser = m.role === "user";
          const showAvatar =
            index === 0 || agentMessages[index - 1]?.role !== m.role;

          return (
            <div key={m.id}>
              {showDebug && (
                <pre className="text-xs text-muted-foreground overflow-scroll">
                  {JSON.stringify(m, null, 2)}
                </pre>
              )}
              <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex gap-2 max-w-[90%] ${
                    isUser ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {showAvatar && !isUser ? (
                    <Avatar username={"AI"} />
                  ) : (
                    !isUser && <div className="w-6" />
                  )}

                  <div className="flex-1">
                    <div>
                      {m.parts?.map((part, i) => {
                        if (part.type === "text") {
                          return (
                            <div key={i}>
                              <Card
                                className={`p-2 text-xs rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                                  isUser
                                    ? "rounded-br-none"
                                    : "rounded-bl-none border-assistant-border"
                                }`}
                              >
                                <MemoizedMarkdown
                                  id={`${m.id}-${i}`}
                                  content={part.text}
                                />
                              </Card>
                              <p
                                className={`text-[10px] text-muted-foreground mt-0.5 ${
                                  isUser ? "text-right" : "text-left"
                                }`}
                              >
                                {formatTime(
                                  m.metadata?.createdAt
                                    ? new Date(m.metadata.createdAt)
                                    : new Date()
                                )}
                              </p>
                            </div>
                          );
                        }

                        if (isToolUIPart(part)) {
                          if (showDebug) return null;

                          const toolCallId = part.toolCallId;

                          return (
                            <ToolInvocationCard
                              key={`${toolCallId}-${i}`}
                              toolUIPart={part}
                              toolCallId={toolCallId}
                              needsConfirmation={false}
                              onSubmit={({ toolCallId, result }) => {
                                addToolResult({
                                  tool: part.type.replace("tool-", ""),
                                  toolCallId,
                                  output: result
                                });
                              }}
                              addToolResult={(toolCallId, result) => {
                                addToolResult({
                                  tool: part.type.replace("tool-", ""),
                                  toolCallId,
                                  output: result
                                });
                              }}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAgentSubmit(e);
          setTextareaHeight("auto");
        }}
        className="p-2 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800"
      >
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              placeholder="Ask AI about your code..."
              className="text-xs w-full border border-neutral-200 dark:border-neutral-700 px-2 py-1.5 rounded-lg resize-none min-h-[32px] max-h-[120px]"
              value={agentInput}
              onChange={(e) => {
                handleAgentInputChange(e);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
                setTextareaHeight(`${e.target.scrollHeight}px`);
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  handleAgentSubmit(e as unknown as React.FormEvent);
                  setTextareaHeight("auto");
                }
              }}
              rows={1}
              style={{ height: textareaHeight }}
            />
          </div>
          {status === "submitted" || status === "streaming" ? (
            <Button
              type="button"
              onClick={stop}
              variant="default"
              size="sm"
              shape="square"
              className="h-8 w-8 flex-shrink-0"
            >
              <Square size={14} />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="default"
              size="sm"
              shape="square"
              className="h-8 w-8 flex-shrink-0"
              disabled={!agentInput.trim()}
            >
              <Send size={14} />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
