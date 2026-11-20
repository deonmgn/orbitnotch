import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Copy, FileText, Folder, FolderOpen, Image as ImageIcon, Minimize2, Pin, Plus, ScanText, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useNotchStore } from "../../store/useNotchStore";
import type { ShelfItem } from "../../types/notch";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ShelfModule() {
  const shelf = useNotchStore((s) => s.shelf);
  const setShelf = useNotchStore((s) => s.setShelf);
  const isDraggingFile = useNotchStore((s) => s.isDraggingFile);
  const setDialogOpen = useNotchStore((s) => s.setDialogOpen);
  const [quickText, setQuickText] = useState("");
  const [statusById, setStatusById] = useState<Record<string, string>>({});

  const flashStatus = (id: string, msg: string) => {
    setStatusById((s) => ({ ...s, [id]: msg }));
    setTimeout(() => {
      setStatusById((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
    }, 1500);
  };

  const handlePickFiles = async () => {
    setDialogOpen(true);
    try {
      const selected = await open({ multiple: true });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const updated = await invoke<ShelfItem[]>("add_shelf_files", { paths });
      setShelf(updated);
    } catch {
      // Ignore in browser preview
    } finally {
      setDialogOpen(false);
    }
  };

  const handleAddText = async () => {
    if (!quickText.trim()) return;
    try {
      const updated = await invoke<ShelfItem[]>("add_shelf_text", { text: quickText });
      setShelf(updated);
      setQuickText("");
    } catch {
      // Ignore
    }
  };

  const handleCopy = async (item: ShelfItem) => {
    if (item.kind === "image" && item.path) {
      try {
        await invoke("copy_image_to_clipboard", { path: item.path });
        flashStatus(item.id, "Image copied!");
        return;
      } catch {
        // Fallback to path copy
      }
    }
    const value = item.textContent ?? item.path ?? item.name;
    try {
      await invoke("copy_text_to_clipboard", { text: value });
    } catch {
      await navigator.clipboard.writeText(value).catch(() => {});
    }
    flashStatus(item.id, "Copied!");
  };

  const handleOcr = async (item: ShelfItem) => {
    if (!item.path) return;
    flashStatus(item.id, "Scanning...");
    try {
      await invoke<string>("extract_image_text_ocr", { path: item.path });
      flashStatus(item.id, "OCR copied!");
    } catch {
      flashStatus(item.id, "No text");
    }
  };

  const handleCompress = async (item: ShelfItem) => {
    if (!item.path) return;
    flashStatus(item.id, "Compressing...");
    try {
      const updated = await invoke<ShelfItem[]>("compress_shelf_image", { path: item.path });
      setShelf(updated);
      flashStatus(item.id, "Compressed!");
    } catch {
      flashStatus(item.id, "Failed");
    }
  };

  const handleTogglePin = async (id: string) => {
    const updated = await invoke<ShelfItem[]>("toggle_pin_shelf_item", { id });
    setShelf(updated);
  };

  const handleRemove = async (id: string) => {
    const updated = await invoke<ShelfItem[]>("remove_shelf_item", { id });
    setShelf(updated);
  };

  const handleClear = async () => {
    const updated = await invoke<ShelfItem[]>("clear_shelf_items");
    setShelf(updated);
  };

  return (
    <div className="flex flex-col h-full gap-2.5">
      {/* Dropzone & Quick Text */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePickFiles}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed text-xs font-medium transition-all ${
            isDraggingFile
              ? "border-cyan-400 bg-cyan-500/20 text-cyan-200 scale-[1.01]"
              : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300"
          }`}
        >
          <UploadCloud className="w-4 h-4 text-cyan-400" />
          <span>Drop files onto Notch or Browse</span>
        </button>

        {shelf.length > 0 && (
          <button
            onClick={handleClear}
            title="Clear unpinned items"
            className="px-2.5 py-2 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddText()}
          placeholder="Stash quick text or link to shelf..."
          className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
        />
        <button
          onClick={handleAddText}
          className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/25 text-xs font-medium flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Stash
        </button>
      </div>

      {/* Shelf Items Grid */}
      <div className="flex-1 overflow-y-auto notch-scroll pr-1">
        {shelf.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-4">
            <UploadCloud className="w-7 h-7 mb-1.5 text-slate-600" />
            <p className="text-xs font-medium text-slate-400">Your Orbit Shelf is empty</p>
            <p className="text-[11px] text-slate-500">
              Drag images, docs, or snippets here for instant access across apps
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {shelf.map((item) => (
              <div
                key={item.id}
                className="group relative flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all"
              >
                {item.previewDataUrl ? (
                  <img
                    src={item.previewDataUrl}
                    alt={item.name}
                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/10"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-slate-900/80 border border-white/10 flex items-center justify-center shrink-0">
                    {item.kind === "folder" ? (
                      <Folder className="w-4 h-4 text-amber-400" />
                    ) : item.kind === "image" ? (
                      <ImageIcon className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-400" />
                    )}
                  </div>
                )}

                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => item.path && invoke("open_shelf_file", { path: item.path }).catch(() => {})}
                >
                  <p className="text-xs font-medium text-slate-100 truncate">{item.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {item.kind === "text" ? "Snippet" : formatSize(item.sizeBytes)}
                    {statusById[item.id] && ` • ${statusById[item.id]}`}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 opacity-75 group-hover:opacity-100">
                  {item.kind === "image" && item.path && (
                    <>
                      <button
                        onClick={() => handleOcr(item)}
                        title="Extract text (OCR)"
                        className="p-1 rounded-md hover:bg-white/10 text-cyan-300"
                      >
                        <ScanText className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleCompress(item)}
                        title="Compress to JPG"
                        className="p-1 rounded-md hover:bg-white/10 text-emerald-300"
                      >
                        <Minimize2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleCopy(item)}
                    title={item.kind === "image" ? "Copy image to clipboard" : "Copy path or text"}
                    className="p-1 rounded-md hover:bg-white/10 text-slate-300"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {item.path && (
                    <button
                      onClick={() => invoke("reveal_in_folder", { path: item.path }).catch(() => {})}
                      title="Reveal in folder"
                      className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-cyan-300"
                    >
                      <FolderOpen className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => handleTogglePin(item.id)}
                    title={item.pinned ? "Unpin" : "Pin"}
                    className={`p-1 rounded-md hover:bg-white/10 ${
                      item.pinned ? "text-cyan-400" : "text-slate-400"
                    }`}
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleRemove(item.id)}
                    title="Remove"
                    className="p-1 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
