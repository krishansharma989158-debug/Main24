import React, { useState } from "react";
import { motion } from "motion/react";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { FileItem } from "../types";

interface DeleteConfirmModalProps {
  item: FileItem;
  onClose: () => void;
  onDeleted: (itemPath: string) => void;
}

export function DeleteConfirmModal({ item, onClose, onDeleted }: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete");
      }

      onDeleted(item.path);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setIsDeleting(false);
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
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                Delete {item.isDirectory ? "Folder" : "File"}?
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                This action is permanent and cannot be undone.
              </p>
            </div>
          </div>

          <div className="p-3 bg-black/60 border border-zinc-800 rounded-xl mb-4 font-mono text-xs text-zinc-300 break-all">
            {item.path}
          </div>

          {error && (
            <div className="mb-4 p-2.5 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              {isDeleting ? (
                <span>Deleting...</span>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Permanently</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
