import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

interface UiState {
  toasts: Toast[];
  modelsOpen: boolean;
  settingsOpen: boolean;
  aiOpen: boolean;

  toast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
  setModelsOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setAiOpen(open: boolean): void;
}

let nextToast = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  modelsOpen: false,
  settingsOpen: false,
  aiOpen: false,

  toast(kind, text) {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 6000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setModelsOpen(open) {
    set({ modelsOpen: open });
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },
  setAiOpen(open) {
    set({ aiOpen: open });
  },
}));
