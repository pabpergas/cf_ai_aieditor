import { useState, useRef, useEffect } from "react";
import { X, Minus, Maximize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/button/Button";

interface FloatingPreviewProps {
  previewUrl: string;
  onClose: () => void;
  initialExpanded?: boolean;
}

export function FloatingPreview({ previewUrl, onClose, initialExpanded = false }: FloatingPreviewProps) {
  const [position, setPosition] = useState({ x: initialExpanded ? 50 : 100, y: initialExpanded ? 50 : 100 });
  const [size, setSize] = useState({
    width: initialExpanded ? window.innerWidth - 100 : 1000,
    height: initialExpanded ? window.innerHeight - 100 : 700
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
      if (isResizing) {
        const newWidth = e.clientX - position.x;
        const newHeight = e.clientY - position.y;
        setSize({
          width: Math.max(400, newWidth),
          height: Math.max(300, newHeight),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    const iframe = document.getElementById("floating-preview-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Floating Window */}
      <div
        ref={windowRef}
        className="fixed z-50 flex flex-col bg-white dark:bg-[#1e1e1e] rounded-lg shadow-2xl border border-neutral-300 dark:border-neutral-700 overflow-hidden"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: isMinimized ? '300px' : `${size.width}px`,
          height: isMinimized ? 'auto' : `${size.height}px`,
        }}
      >
        {/* Window Title Bar */}
        <div
          className="h-10 bg-neutral-100 dark:bg-[#2d2d30] border-b border-neutral-300 dark:border-neutral-700 flex items-center justify-between px-3 cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 cursor-pointer" onClick={onClose} />
            <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 cursor-pointer" onClick={toggleMinimize} />
            <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 cursor-pointer" />
            <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate ml-2">
              Preview - {previewUrl}
            </span>
          </div>

          <div className="flex items-center gap-1 window-controls">
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              className="h-6 w-6"
              onClick={handleRefresh}
              tooltip="Refresh"
              tooltipSide="bottom"
            >
              <RefreshCw size={12} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              shape="square"
              className="h-6 w-6"
              onClick={toggleMinimize}
              tooltip={isMinimized ? "Restore" : "Minimize"}
              tooltipSide="bottom"
            >
              <Minus size={12} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              shape="square"
              className="h-6 w-6"
              onClick={onClose}
              tooltip="Close"
              tooltipSide="bottom"
            >
              <X size={12} />
            </Button>
          </div>
        </div>

        {/* Address Bar */}
        {!isMinimized && (
          <div className="h-9 bg-neutral-50 dark:bg-[#252526] border-b border-neutral-300 dark:border-neutral-700 flex items-center px-3">
            <div className="flex-1 bg-white dark:bg-[#3c3c3c] border border-neutral-300 dark:border-neutral-600 rounded-md px-3 py-1">
              <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate block">
                {previewUrl}
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        {!isMinimized && (
          <div className="flex-1 relative bg-white">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#1e1e1e] z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F48120]"></div>
                  <p className="text-xs text-neutral-500">Loading preview...</p>
                </div>
              </div>
            )}

            <iframe
              id="floating-preview-iframe"
              src={previewUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => setIsLoading(false)}
              title="Floating Preview"
            />
          </div>
        )}

        {/* Resize Handle */}
        {!isMinimized && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleResizeMouseDown}
          >
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-neutral-400 dark:border-neutral-600" />
          </div>
        )}
      </div>
    </>
  );
}
