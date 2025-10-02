import { useState, useEffect } from "react";
import { RefreshCw, X, Maximize2, Expand } from "lucide-react";
import { Button } from "@/components/button/Button";

interface PreviewProps {
  previewUrl?: string;
  projectId: string;
  onClose?: () => void;
  onPopout?: () => void;
  onFullscreen?: () => void;
}

export function Preview({ previewUrl, projectId, onClose, onPopout, onFullscreen }: PreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(previewUrl);

  useEffect(() => {
    setCurrentUrl(previewUrl);
    setIsLoading(true);
    setError(null);
  }, [previewUrl]);

  const handleRefresh = () => {
    setIsLoading(true);
    setError(null);
    // Force iframe reload
    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const handleOpenInNewTab = () => {
    if (currentUrl) {
      window.open(currentUrl, "_blank");
    }
  };

  const handlePopout = () => {
    if (onPopout) {
      onPopout();
    }
  };

  const handleFullscreen = () => {
    if (onFullscreen) {
      onFullscreen();
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleError = () => {
    setIsLoading(false);
    setError("Failed to load preview");
  };

  if (!currentUrl) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white dark:bg-[#1e1e1e] border-l border-neutral-300 dark:border-[#2b2b2b]">
        <div className="text-center space-y-4 p-6">
          <div className="text-neutral-400 dark:text-neutral-500">
            <svg
              className="w-16 h-16 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              No Preview Available
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Build your project to see a preview
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-[#1e1e1e] border-l border-neutral-300 dark:border-[#2b2b2b]">
      {/* Preview Header */}
      <div className="h-10 bg-neutral-100 dark:bg-[#252526] border-b border-neutral-300 dark:border-[#2b2b2b] flex items-center justify-between px-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
            {currentUrl}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            className="h-7 w-7"
            onClick={handleRefresh}
            tooltip="Refresh preview"
            tooltipSide="bottom"
          >
            <RefreshCw size={14} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            shape="square"
            className="h-7 w-7"
            onClick={handlePopout}
            tooltip="Open in floating window"
            tooltipSide="bottom"
          >
            <Maximize2 size={14} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            shape="square"
            className="h-7 w-7"
            onClick={handleFullscreen}
            tooltip="Expand floating window"
            tooltipSide="bottom"
          >
            <Expand size={14} />
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              className="h-7 w-7"
              onClick={onClose}
              tooltip="Close preview"
              tooltipSide="bottom"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 relative bg-white">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#1e1e1e] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F48120]"></div>
              <p className="text-xs text-neutral-500">Loading preview...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#1e1e1e] z-10">
            <div className="text-center space-y-3">
              <div className="text-red-500">
                <svg
                  className="w-12 h-12 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Preview Error
                </h3>
                <p className="text-xs text-neutral-500">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Try Again
              </Button>
            </div>
          </div>
        )}

        <iframe
          id="preview-iframe"
          src={currentUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          onLoad={handleLoad}
          onError={handleError}
          title="Preview"
        />
      </div>
    </div>
  );
}
