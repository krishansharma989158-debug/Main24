import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  FileCode,
  Save,
  Check,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Download,
  AlertCircle,
  Clock,
  HardDrive,
  Copy,
  WrapText,
} from "lucide-react";

interface FileEditorModalProps {
  filePath: string;
  fileName: string;
  initialContent: string;
  onClose: () => void;
  onSaved: (filePath: string, newContent: string) => void;
}

export function FileEditorModal({
  filePath,
  fileName,
  initialContent,
  onClose,
  onSaved,
}: FileEditorModalProps) {
  const [content, setContent] = useState(initialContent);
  const [originalContent, setOriginalContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const isDirty = content !== originalContent;

  // Sync state when initialContent changes
  useEffect(() => {
    setContent(initialContent);
    setOriginalContent(initialContent);
    setSaveStatus("idle");
    setErrorMessage(null);
  }, [initialContent, filePath]);

  // Handle Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
      if (e.key === "Escape" && !isDirty) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, filePath, isDirty]);

  // Sync scroll of line numbers with textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleCursorMove = () => {
    if (!textareaRef.current) return;
    const textBeforeCursor = content.substring(0, textareaRef.current.selectionStart);
    const lines = textBeforeCursor.split("\n");
    const currentLine = lines.length;
    const currentCol = lines[lines.length - 1].length + 1;
    setCursorPos({ line: currentLine, col: currentCol });
  };

  // Handle Tab key inside editor for proper indentation
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + "  " + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const saveFile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          content: content,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save file");
      }

      setOriginalContent(content);
      setSaveStatus("saved");
      onSaved(filePath, content);

      setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } catch (err: any) {
      console.error("Save error:", err);
      setSaveStatus("error");
      setErrorMessage(err.message || "Failed to save file to disk");
    } finally {
      setIsSaving(false);
    }
  };

  const revertChanges = () => {
    if (window.confirm("Are you sure you want to discard all unsaved edits?")) {
      setContent(originalContent);
      setSaveStatus("idle");
      setErrorMessage(null);
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lines = content.split("\n");
  const lineCount = lines.length;
  const characterCount = content.length;
  const sizeFormatted =
    characterCount < 1024
      ? `${characterCount} B`
      : characterCount < 1024 * 1024
      ? `${(characterCount / 1024).toFixed(1)} KB`
      : `${(characterCount / (1024 * 1024)).toFixed(2)} MB`;

  const getExtension = (name: string) => {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()?.toUpperCase() : "TXT";
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className={`bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? "fixed inset-2 sm:inset-4 w-[calc(100%-16px)] sm:w-[calc(100%-32px)] h-[calc(100%-16px)] sm:h-[calc(100%-32px)]"
            : "w-full max-w-5xl h-[88vh]"
        }`}
      >
        {/* Top Header */}
        <div className="px-4 py-3 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400 shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-100 font-mono truncate">
                  {fileName}
                </span>
                <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-mono rounded border border-zinc-700">
                  {getExtension(fileName)}
                </span>
                {isDirty && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-medium rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Unsaved
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium rounded-full">
                    <Check className="w-3 h-3" />
                    Saved to Disk
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-zinc-500 truncate">{filePath}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isDirty && (
              <button
                id="btn-revert-file"
                onClick={revertChanges}
                className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-zinc-700"
                title="Discard unsaved changes"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Revert</span>
              </button>
            )}

            <button
              id="btn-save-file"
              onClick={saveFile}
              disabled={isSaving || !isDirty}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                isDirty
                  ? "bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white ring-1 ring-emerald-400/50"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50"
              }`}
              title="Save changes to disk permanently (Ctrl+S / Cmd+S)"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save (Ctrl+S)</span>
                </>
              )}
            </button>

            <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

            <button
              id="btn-wrap-text"
              onClick={() => setWordWrap(!wordWrap)}
              className={`p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ${
                wordWrap ? "bg-zinc-800 text-sky-400" : ""
              }`}
              title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
            >
              <WrapText className="w-4 h-4" />
            </button>

            <button
              id="btn-copy-file-content"
              onClick={copyContent}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Copy all file content"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              id="btn-download-file"
              onClick={downloadFile}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              id="btn-toggle-fullscreen"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors hidden sm:block"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              id="btn-close-file-modal"
              onClick={() => {
                if (isDirty) {
                  if (window.confirm("You have unsaved changes. Are you sure you want to close without saving?")) {
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors ml-1"
              title="Close editor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error notification banner if save fails */}
        {errorMessage && (
          <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-2 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-rose-900 rounded text-rose-400 hover:text-rose-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Editor Main Canvas */}
        <div className="flex-1 flex overflow-hidden bg-black/90 relative">
          {/* Line Numbers Column */}
          <div
            ref={lineNumbersRef}
            aria-hidden="true"
            className="w-12 sm:w-16 py-3 px-2 bg-zinc-950/80 border-r border-zinc-800/80 select-none text-right font-mono text-[11px] leading-[20px] text-zinc-600 overflow-hidden shrink-0"
          >
            {Array.from({ length: Math.max(lineCount, 1) }).map((_, i) => (
              <div
                key={i + 1}
                className={cursorPos.line === i + 1 ? "text-sky-400 font-semibold" : ""}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Textarea */}
          <div className="flex-1 relative h-full">
            <textarea
              id="file-content-textarea"
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={handleCursorMove}
              onClick={handleCursorMove}
              onScroll={handleScroll}
              spellCheck={false}
              wrap={wordWrap ? "soft" : "off"}
              className="w-full h-full p-3 bg-transparent text-zinc-200 font-mono text-[12px] leading-[20px] resize-none outline-none focus:ring-0 selection:bg-sky-600/40 tab-size-2 overflow-auto"
              placeholder="File is empty. Start typing to write content..."
            />
          </div>
        </div>

        {/* Footer Status Bar */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0 select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>UTF-8</span>
            </span>
            <span className="hidden sm:inline">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span>{lineCount} lines</span>
            <span>{characterCount} chars</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-zinc-600" />
              <span>{sizeFormatted}</span>
            </span>
            <span className="text-[10px] text-zinc-600 hidden sm:inline">
              Permanent Disk Storage
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
