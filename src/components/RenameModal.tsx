import React, { useState } from "react";
import { motion } from "motion/react";
import { Edit3, X, AlertCircle } from "lucide-react";
import { FileItem } from "../types";

interface RenameModalProps {
  item: FileItem;
  onClose: () => void;
  onRenamed: (oldPath: string, newPath: string) => void;
}

export function RenameModal({ item, onClose, onRenamed }: RenameModalProps) {
  const [newName, setNewName] = useState(item.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === item.name) {
      onClose();
      return;
    }

    setIsRenaming(true);
    setError(null);

    try {
      const response = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPath: item.path,
          newName: newName.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to rename");
      }

      onRenamed(item.path, data.path);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to rename item");
    } finally {
      setIsRenaming(false);
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
            <div className="p-1.5 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400">
              <Edit3 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
              Rename {item.isDirectory ? "Folder" : "File"}
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
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              New Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              className="w-full bg-black/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
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
              disabled={isRenaming || !newName.trim()}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              {isRenaming ? (
                <span>Renaming...</span>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Rename</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
