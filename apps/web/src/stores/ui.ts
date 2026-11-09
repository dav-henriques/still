import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Per-browser interface preferences (not project data — that lives on disk via the engine). */
interface UiPrefs {
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  volume: number;
  muted: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  setInspectorOpen: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const probe = '__still_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

export const useUi = create<UiPrefs>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      inspectorOpen: true,
      volume: 0.85,
      muted: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setVolume: (volume) => set({ volume }),
      setMuted: (muted) => set({ muted }),
    }),
    { name: 'still.ui', storage: safeStorage },
  ),
);

// ── Notifications (errors and the occasional confirmation; deliberately sparse) ──

export interface Toast {
  id: number;
  kind: 'error' | 'info';
  title: string;
  detail?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;
export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 9000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const notifyError = (err: unknown, title?: string) => {
  const e = err as { message?: string; details?: string };
  useToasts.getState().push({ kind: 'error', title: title ?? e.message ?? 'Something went wrong', detail: title ? e.message : undefined });
};
export const notify = (title: string, detail?: string) => useToasts.getState().push({ kind: 'info', title, detail });

// ── Imperative confirm / prompt dialogs ──

export type DialogRequest =
  | { kind: 'confirm'; title: string; message?: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; title: string; label: string; initial: string; confirmLabel?: string; resolve: (value: string | null) => void };

interface DialogStore {
  current: DialogRequest | null;
  open: (d: DialogRequest) => void;
  close: () => void;
}

export const useDialogs = create<DialogStore>((set) => ({
  current: null,
  open: (current) => set({ current }),
  close: () => set({ current: null }),
}));

export const confirmDialog = (opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) =>
  new Promise<boolean>((resolve) => useDialogs.getState().open({ kind: 'confirm', ...opts, resolve }));

export const promptDialog = (opts: { title: string; label: string; initial: string; confirmLabel?: string }) =>
  new Promise<string | null>((resolve) => useDialogs.getState().open({ kind: 'prompt', ...opts, resolve }));
