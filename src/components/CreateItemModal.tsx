import React, { useState } from "react";
import { motion } from "motion/react";
import { File, Folder, Plus, X, AlertCircle } from "lucide-react";

interface CreateItemModalProps {
  currentPath: string;
  onClose: () => void;
  onCreated: (newPath: string, isDirectory: boolean, fileName: string) => void;
}

export function CreateItemModal({ currentPath, onClose, onCreated }: CreateItemModalProps) {
  const [name, setName] = useState("");
  const [isDirectory, setIsDirectory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a valid name");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dirPath: currentPath,
          name: name.trim(),
          isDirectory: isDirectory,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create item");
      }

      onCreated(data.path, isDirectory, name.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create item");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <Plus className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
              Create New {isDirectory ? "Directory" : "File"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setIsDirectory(false)}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                !isDirectory
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <File className="w-3.5 h-3.5 text-sky-400" />
              <span>New File</span>
            </button>
            <button
              type="button"
              onClick={() => setIsDirectory(true)}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                isDirectory
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>New Folder</span>
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              {isDirectory ? "Folder Name" : "File Name"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isDirectory ? "my-new-folder" : "example.txt / script.js"}
              autoFocus
              className="w-full bg-black/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
            <p className="text-[10px] font-mono text-zinc-500 mt-1.5 truncate">
              Path: {currentPath}/{name || "..."}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <span>Creating...</span>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create {isDirectory ? "Folder" : "File"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
