import { useState } from "react";
import type { ToolUIPart } from "ai";
import { Bot, ChevronDown } from "lucide-react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { APPROVAL } from "@/shared";

interface ToolResultWithContent {
  content: Array<{ type: string; text: string }>;
}

function isToolResultWithContent(
  result: unknown
): result is ToolResultWithContent {
  return (
    typeof result === "object" &&
    result !== null &&
    "content" in result &&
    Array.isArray((result as ToolResultWithContent).content)
  );
}

interface ToolInvocationCardProps {
  toolUIPart: ToolUIPart;
  toolCallId: string;
  needsConfirmation: boolean;
  onSubmit: ({
    toolCallId,
    result
  }: {
    toolCallId: string;
    result: string;
  }) => void;
  addToolResult: (toolCallId: string, result: string) => void;
}

export function ToolInvocationCard({
  toolUIPart,
  toolCallId,
  needsConfirmation,
  onSubmit
  // addToolResult
}: ToolInvocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse tool name to human-readable format
  const parseToolName = (toolName: string | undefined): string => {
    if (!toolName) return 'Tool';
    // Convert camelCase to Title Case with spaces
    return toolName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
      .trim();
  };

  return (
    <Card className="p-3 my-2 w-full max-w-[500px] rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden hover:border-[#F48120]/30 transition-colors">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 cursor-pointer group"
      >
        <div
          className={`${needsConfirmation ? "bg-[#F48120]/10" : "bg-[#F48120]/10"} p-2 rounded-md flex-shrink-0 group-hover:bg-[#F48120]/20 transition-colors`}
        >
          <Bot size={14} className="text-[#F48120]" />
        </div>
        <div className="flex-1 text-left">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <span className="text-foreground">{parseToolName(toolUIPart.toolName)}</span>
            {!needsConfirmation && toolUIPart.state === "output-available" && (
              <span className="text-xs text-green-600 dark:text-green-500">✓</span>
            )}
          </h4>
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`transition-all duration-200 ${isExpanded ? "max-h-[250px] opacity-100 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div
          className="overflow-y-auto"
          style={{ maxHeight: isExpanded ? "230px" : "0px" }}
        >
          <div className="mb-3">
            <h5 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Arguments
            </h5>
            <pre className="bg-neutral-200/50 dark:bg-neutral-800/50 p-3 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words border border-neutral-300 dark:border-neutral-700">
              {JSON.stringify(toolUIPart.input, null, 2)}
            </pre>
          </div>

          {needsConfirmation && toolUIPart.state === "input-available" && (
            <div className="flex gap-2 justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => onSubmit({ toolCallId, result: APPROVAL.NO })}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onSubmit({ toolCallId, result: APPROVAL.YES })}
              >
                Approve
              </Button>
            </div>
          )}

          {!needsConfirmation && toolUIPart.state === "output-available" && (
            <div>
              <h5 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Result
              </h5>
              <pre className="bg-neutral-200/50 dark:bg-neutral-800/50 p-3 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words border border-neutral-300 dark:border-neutral-700">
                {(() => {
                  const result = toolUIPart.output;
                  if (isToolResultWithContent(result)) {
                    return result.content
                      .map((item: { type: string; text: string }) => {
                        if (
                          item.type === "text" &&
                          item.text.startsWith("\n~ Page URL:")
                        ) {
                          const lines = item.text.split("\n").filter(Boolean);
                          return lines
                            .map(
                              (line: string) => `- ${line.replace("\n~ ", "")}`
                            )
                            .join("\n");
                        }
                        return item.text;
                      })
                      .join("\n");
                  }
                  return JSON.stringify(result, null, 2);
                })()}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
