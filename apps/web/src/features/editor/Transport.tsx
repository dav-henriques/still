import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatDuration } from '@still/shared';
import { Pause, Play, Volume1, Volume2, VolumeX } from 'lucide-react';
import { IconButton } from '../../components/ui/Button';
import { Range } from '../../components/ui/controls';
import { urls } from '../../lib/api';
import { usePeaks } from '../../lib/queries';
import { cn, isTyping } from '../../lib/utils';
import { useDialogs, useUi } from '../../stores/ui';

/**
 * Playback of the real imported audio. Position updates run through requestAnimationFrame and
 * write straight to the DOM, so the editor doesn't re-render 60 times a second.
 */
export function Transport({ projectId, beatId, duration }: { projectId: string; beatId: string; duration: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const timeText = useRef<HTMLSpanElement>(null);
  const playedClip = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { volume, muted, setVolume, setMuted } = useUi();
  const total = duration;

  const paint = useCallback(() => {
    const t = audio.current?.currentTime ?? 0;
    const f = total > 0 ? Math.min(1, t / total) : 0;
    if (timeText.current) timeText.current.textContent = formatDuration(t);
    if (playedClip.current) playedClip.current.style.width = `${f * 100}%`;
    if (playhead.current) playhead.current.style.left = `${f * 100}%`;
  }, [total]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint]);

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume;
      audio.current.muted = muted;
    }
  }, [volume, muted]);

  // Release the media resource when switching beats / leaving.
  useEffect(() => {
    const el = audio.current;
    return () => {
      if (!el) return;
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, []);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch((e: Error) => setError(e.message));
    else el.pause();
  }, []);

  const seek = useCallback(
    (t: number) => {
      const el = audio.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(total, t));
      paint();
    },
    [total, paint],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || useDialogs.getState().current || document.querySelector('[role="dialog"]')) return;
      const el = audio.current;
      if (!el) return;
      if (e.code === 'Space') {
        // Let focused buttons keep their native Space behaviour.
        if ((e.target as HTMLElement).closest('button,[role="radio"],[role="checkbox"],input')) return;
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if ((e.target as HTMLElement).closest('input,[role="radiogroup"]')) return;
        e.preventDefault();
        seek(el.currentTime + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
      } else if (e.key.toLowerCase() === 'm') {
        setMuted(!useUi.getState().muted);
      } else if (e.key === 'Home') {
        seek(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek, setMuted]);

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex shrink-0 items-center gap-4">
      <audio
        ref={audio}
        src={urls.audio(projectId, beatId)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          paint();
        }}
        onEnded={() => {
          setPlaying(false);
          paint();
        }}
        onSeeked={paint}
        onError={() => setError('This audio could not be played in the browser. Export still works.')}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-transform duration-100 hover:scale-[1.04] active:scale-95"
      >
        {playing ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />}
      </button>

      <div className="tabular w-[92px] shrink-0 text-xs">
        <span ref={timeText} className="text-fg">
          0:00
        </span>
        <span className="text-fg-3"> / {formatDuration(total)}</span>
      </div>

      <div className="min-w-0 flex-1">
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : (
          <Waveform projectId={projectId} beatId={beatId} duration={total} onSeek={seek} playedClip={playedClip} playhead={playhead} />
        )}
      </div>

      <div className="flex w-[120px] shrink-0 items-center gap-1.5 max-[1100px]:w-auto">
        <IconButton icon={VolumeIcon} label={muted ? 'Unmute (M)' : 'Mute (M)'} size="md" onClick={() => setMuted(!muted)} />
        <Range
          label="Volume"
          className="max-[1100px]:hidden"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(v) => {
            setVolume(v);
            if (muted && v > 0) setMuted(false);
          }}
        />
      </div>
    </div>
  );
}

function Waveform({
  projectId,
  beatId,
  duration,
  onSeek,
  playedClip,
  playhead,
}: {
  projectId: string;
  beatId: string;
  duration: number;
  onSeek: (t: number) => void;
  playedClip: React.RefObject<HTMLDivElement | null>;
  playhead: React.RefObject<HTMLDivElement | null>;
}) {
  const { data: peaks, isLoading, isError } = usePeaks(projectId, beatId);
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const played = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const HEIGHT = 44;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!peaks?.length || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const bar = 2;
    const gap = 1;
    const count = Math.max(1, Math.floor(width / (bar + gap)));
    const max = Math.max(0.05, ...peaks);
    const values = Array.from({ length: count }, (_, i) => {
      const a = Math.floor((i / count) * peaks.length);
      const b = Math.max(a + 1, Math.floor(((i + 1) / count) * peaks.length));
      let m = 0;
      for (let k = a; k < b; k++) m = Math.max(m, peaks[k] ?? 0);
      return m / max;
    });
    for (const [canvas, color] of [
      [base.current, 'rgba(255,255,255,0.2)'],
      [played.current, getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()],
    ] as const) {
      if (!canvas) continue;
      canvas.width = width * dpr;
      canvas.height = HEIGHT * dpr;
      canvas.style.width = `${width}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = color;
      values.forEach((v, i) => {
        const h = Math.max(1.5, v * (HEIGHT - 4));
        ctx.beginPath();
        ctx.roundRect(i * (bar + gap), (HEIGHT - h) / 2, bar, h, 1);
        ctx.fill();
      });
    }
  }, [peaks, width]);

  const timeAt = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };

  return (
    <div
      ref={wrap}
      role="slider"
      tabIndex={-1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      className="relative cursor-pointer touch-none"
      style={{ height: HEIGHT }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onSeek(timeAt(e.clientX));
      }}
      onPointerMove={(e) => {
        setHover(timeAt(e.clientX));
        if (e.buttons === 1) onSeek(timeAt(e.clientX));
      }}
      onPointerLeave={() => setHover(null)}
    >
      {isLoading || isError || !peaks ? (
        <div className={cn('absolute inset-x-0 top-1/2 h-px -translate-y-1/2', isError ? 'bg-danger/40' : 'animate-pulse bg-white/15')} />
      ) : null}
      <canvas ref={base} className="absolute inset-y-0 left-0" height={HEIGHT} />
      <div ref={playedClip} className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: 0 }}>
        <canvas ref={played} className="absolute inset-y-0 left-0" height={HEIGHT} />
      </div>
      <div ref={playhead} className="pointer-events-none absolute inset-y-0 w-px bg-fg" style={{ left: 0 }} />
      {hover != null && (
        <>
          <div className="pointer-events-none absolute inset-y-1 w-px bg-white/30" style={{ left: `${(hover / duration) * 100}%` }} />
          <div
            className="tabular pointer-events-none absolute -top-6 -translate-x-1/2 rounded-[4px] bg-surface-3 px-1.5 py-0.5 text-2xs text-fg"
            style={{ left: `${(hover / duration) * 100}%` }}
          >
            {formatDuration(hover)}
          </div>
        </>
      )}
    </div>
  );
}
