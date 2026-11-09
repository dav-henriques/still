import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cropToBoxStyle, panCrop, VIDEO, zoomCrop, computeCropRect, type Artwork, type Crop } from '@still/shared';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/controls';
import { urls } from '../../lib/api';
import { cn } from '../../lib/utils';

const BOX_LEFT = VIDEO.artworkX / VIDEO.width; // 0.21875
const BOX_W = VIDEO.artworkSize / VIDEO.width; // 0.5625
const FOOTER_H = 76;

/**
 * The 16:9 preview *is* the crop editor: what you see inside the square is exactly what is
 * exported (same computeCropRect), and dragging / scrolling on it adjusts the framing.
 */
export function PreviewStage({
  projectId,
  artwork,
  crop,
  onCrop,
  onDropImage,
  onChooseImage,
  busy,
  footer,
}: {
  projectId: string;
  artwork: Artwork | null;
  crop: Crop;
  onCrop: (c: Crop) => void;
  onDropImage: (file: File) => void;
  onChooseImage: () => void;
  busy: boolean;
  footer?: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [interacting, setInteracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;

  // Fit the 16:9 frame into the available space.
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      // Leave room under the frame for the transport so the two read as one unit.
      const w = Math.floor(Math.min(width, ((height - FOOTER_H) * 16) / 9));
      setSize({ w, h: (w * 9) / 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setLoaded(false), [artwork?.id]);

  const box = size.w * BOX_W; // the artwork square's edge in CSS px (== frame height)
  const style = artwork ? cropToBoxStyle(artwork.width, artwork.height, crop, box) : null;
  const pulse = () => {
    setInteracting(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setInteracting(false), 700);
  };

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !artwork) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const c = cropRef.current;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      onCrop(zoomCrop(artwork.width, artwork.height, c, c.zoom * factor, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
      pulse();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [artwork, onCrop]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!artwork || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, crop: cropRef.current };
    const sourcePerPx = computeCropRect(artwork.width, artwork.height, start.crop).size / box;
    setDragging(true);
    setInteracting(true);
    const move = (ev: PointerEvent) => {
      // Moving the image right moves the crop window left.
      onCrop(panCrop(artwork.width, artwork.height, start.crop, -(ev.clientX - start.x) * sourcePerPx, -(ev.clientY - start.y) * sourcePerPx));
    };
    const up = () => {
      setDragging(false);
      pulse();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!artwork) return;
    const step = (e.shiftKey ? 40 : 8) * (computeCropRect(artwork.width, artwork.height, crop).size / Math.max(1, box));
    const map: Record<string, () => Crop> = {
      ArrowLeft: () => panCrop(artwork.width, artwork.height, crop, -step, 0),
      ArrowRight: () => panCrop(artwork.width, artwork.height, crop, step, 0),
      ArrowUp: () => panCrop(artwork.width, artwork.height, crop, 0, -step),
      ArrowDown: () => panCrop(artwork.width, artwork.height, crop, 0, step),
      '+': () => zoomCrop(artwork.width, artwork.height, crop, crop.zoom * 1.1),
      '=': () => zoomCrop(artwork.width, artwork.height, crop, crop.zoom * 1.1),
      '-': () => zoomCrop(artwork.width, artwork.height, crop, crop.zoom / 1.1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      e.stopPropagation();
      onCrop(fn());
      pulse();
    }
  };

  const imgStyle = style ? { width: style.width, height: style.height, transform: `translate(${style.offsetX}px, ${style.offsetY}px)` } : undefined;
  const src = artwork ? urls.artwork(projectId, artwork.id, 'display') : '';

  return (
    <div ref={outer} className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center">
      <div
        className="relative shrink-0 overflow-hidden bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_20px_60px_-20px_rgba(0,0,0,0.9)]"
        style={{ width: size.w, height: size.h }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropHover(true);
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropHover(false);
          const f = e.dataTransfer.files[0];
          if (f) onDropImage(f);
        }}
      >
        {/* Ghost of the full image while framing, so you can see what's outside the square. */}
        {artwork && imgStyle && (
          <img
            src={src}
            alt=""
            aria-hidden
            draggable={false}
            className={cn('pointer-events-none absolute top-0 max-w-none transition-opacity duration-200', interacting ? 'opacity-25' : 'opacity-0')}
            style={{ ...imgStyle, left: size.w * BOX_LEFT }}
          />
        )}

        <div
          ref={boxRef}
          role={artwork ? 'img' : undefined}
          aria-label={artwork ? 'Artwork framing. Drag to reposition, scroll to zoom, arrow keys to nudge.' : undefined}
          tabIndex={artwork ? 0 : -1}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onDoubleClick={() => !artwork && onChooseImage()}
          className={cn(
            'absolute top-0 overflow-hidden outline-none focus-visible:shadow-[0_0_0_1.5px_var(--color-accent)]',
            artwork ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '',
            interacting && 'shadow-[0_0_0_1px_rgba(255,255,255,0.5)]',
          )}
          style={{ left: size.w * BOX_LEFT, width: size.w * BOX_W, height: size.h }}
        >
          {artwork && imgStyle ? (
            <img
              key={artwork.id}
              src={src}
              alt=""
              draggable={false}
              onLoad={() => setLoaded(true)}
              className={cn('pointer-events-none absolute top-0 left-0 max-w-none transition-opacity duration-150', loaded ? 'opacity-100' : 'opacity-0')}
              style={imgStyle}
            />
          ) : (
            <div className={cn('flex size-full flex-col items-center justify-center gap-3 bg-[#0b0b0b] text-center', dropHover && 'bg-accent-soft')}>
              <div className="absolute inset-3 rounded-md border border-dashed border-white/15" />
              <ImagePlus size={26} strokeWidth={1.25} className={dropHover ? 'text-accent' : 'text-fg-3'} />
              <div className="relative">
                <p className="text-sm font-medium text-fg">Add artwork</p>
                <p className="mt-1 text-xs text-fg-3">Drop a PNG, JPEG or WebP — required for export</p>
              </div>
              <Button size="sm" className="relative" onClick={onChooseImage}>
                Choose image
              </Button>
            </div>
          )}
          {artwork && dropHover && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">Drop to replace artwork</div>}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Spinner size={18} />
            </div>
          )}
        </div>
      </div>
      {footer && (
        <div className="shrink-0 pt-5" style={{ width: size.w }}>
          {footer}
        </div>
      )}
    </div>
  );
}
