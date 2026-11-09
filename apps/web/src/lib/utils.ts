import type { ExportJob } from '@still/shared';

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: abs > 86400 * 300 ? 'numeric' : undefined });
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

/** Latest export job per beat, for status columns. */
export function latestJobByBeat(jobs: ExportJob[] | undefined, projectId: string): Map<string, ExportJob> {
  const map = new Map<string, ExportJob>();
  for (const j of jobs ?? []) {
    if (j.projectId !== projectId) continue;
    const prev = map.get(j.beatId);
    if (!prev || prev.createdAt <= j.createdAt) map.set(j.beatId, j);
  }
  return map;
}

export function filesOfKind(files: FileList | File[] | null | undefined, kind: 'audio' | 'image'): File[] {
  const audioExt = /\.(wav|mp3|flac|m4a|aac|ogg|aif|aiff)$/i;
  const imageExt = /\.(png|jpe?g|webp)$/i;
  return Array.from(files ?? []).filter((f) => (kind === 'audio' ? audioExt : imageExt).test(f.name));
}
