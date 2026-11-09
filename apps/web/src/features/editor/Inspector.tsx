import type { ReactNode } from 'react';
import { computeCropRect, DEFAULT_CROP, formatBytes, formatDuration, QUALITY_PRESETS, VIDEO, ZOOM_MAX, ZOOM_MIN, zoomCrop, type Artwork, type Beat, type Crop, type Project, type Quality } from '@still/shared';
import { AlertTriangle, ImagePlus, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { Range, Segmented } from '../../components/ui/controls';
import { CroppedArt } from '../artwork/CroppedArt';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="px-4 py-4 shadow-[inset_0_-1px_0_var(--color-line)]">
      <div className="mb-3 flex h-5 items-center justify-between">
        <h3 className="text-2xs font-medium tracking-[0.06em] text-fg-3 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-3">{label}</dt>
      <dd className="tabular min-w-0 truncate text-right text-fg-2">{children}</dd>
    </>
  );
}

export function Inspector({
  project,
  beat,
  artwork,
  crop,
  onCrop,
  onChooseImage,
  onRemoveArtwork,
  onQuality,
}: {
  project: Project;
  beat: Beat;
  artwork: Artwork | null;
  crop: Crop;
  onCrop: (c: Crop) => void;
  onChooseImage: () => void;
  onRemoveArtwork: () => void;
  onQuality: (q: Quality) => void;
}) {
  const a = beat.audio;
  const rect = artwork ? computeCropRect(artwork.width, artwork.height, crop) : null;
  const upscaled = rect && rect.size < VIDEO.artworkSize;
  const setZoom = (z: number) => artwork && onCrop(zoomCrop(artwork.width, artwork.height, crop, z));

  return (
    <aside aria-label="Inspector" className="flex w-[296px] shrink-0 flex-col overflow-y-auto bg-bg/40 shadow-[inset_1px_0_0_var(--color-line)]">
      <Section
        title="Artwork"
        action={artwork && <IconButton icon={Trash2} label="Remove artwork" size="sm" onClick={onRemoveArtwork} className="-mr-1" />}
      >
        {artwork ? (
          <div className="flex items-center gap-3">
            <CroppedArt projectId={project.id} artwork={artwork} crop={crop} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={artwork.originalFilename}>
                {artwork.originalFilename}
              </p>
              <p className="tabular mt-0.5 text-xs text-fg-3">
                {artwork.width} × {artwork.height} · {artwork.format.toUpperCase()} · {formatBytes(artwork.size)}
              </p>
              <button type="button" onClick={onChooseImage} className="mt-1 rounded-sm text-xs text-fg-2 hover:text-fg" title="Replace artwork (Ctrl+O)">
                Replace…
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2.5">
            <p className="text-xs text-fg-2">This beat needs artwork before it can be exported. Any aspect ratio works — you'll frame it as a square.</p>
            <Button size="sm" variant="primary" icon={ImagePlus} onClick={onChooseImage}>
              Choose image
            </Button>
          </div>
        )}
      </Section>

      <Section
        title="Framing"
        action={
          artwork && (
            <button
              type="button"
              onClick={() => onCrop({ ...DEFAULT_CROP })}
              disabled={crop.zoom === 1 && crop.x === 0.5 && crop.y === 0.5}
              className="flex items-center gap-1 rounded-sm text-xs text-fg-2 hover:text-fg disabled:text-fg-3"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )
        }
      >
        <div className={artwork ? '' : 'pointer-events-none opacity-40'} aria-disabled={!artwork}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-fg-2">Zoom</span>
            <span className="tabular text-fg">{crop.zoom.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton icon={ZoomOut} label="Zoom out" size="sm" onClick={() => setZoom(crop.zoom / 1.15)} disabled={crop.zoom <= ZOOM_MIN} />
            <Range label="Zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={crop.zoom} onChange={setZoom} />
            <IconButton icon={ZoomIn} label="Zoom in" size="sm" onClick={() => setZoom(crop.zoom * 1.15)} disabled={crop.zoom >= ZOOM_MAX} />
          </div>
          <dl className="mt-3.5 grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
            <Row label="Position">
              {Math.round(crop.x * 100)}% · {Math.round(crop.y * 100)}%
            </Row>
            {rect && (
              <Row label="Source area">
                {rect.size} × {rect.size} px
              </Row>
            )}
          </dl>
          {upscaled && (
            <p className="mt-3 flex gap-2 text-xs text-accent">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              Upscaled from {rect.size}px to {VIDEO.artworkSize}px — may look soft.
            </p>
          )}
          <p className="mt-3 text-xs text-fg-3">Drag the preview to reposition. Scroll to zoom. Arrow keys nudge when the preview is focused.</p>
        </div>
      </Section>

      <Section title="Video">
        <Segmented
          label="Export quality"
          size="sm"
          value={project.exportSettings.quality}
          onChange={onQuality}
          options={(Object.keys(QUALITY_PRESETS) as Quality[]).map((k) => ({ value: k, label: QUALITY_PRESETS[k].label, title: QUALITY_PRESETS[k].hint }))}
        />
        <dl className="mt-3.5 grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
          <Row label="Resolution">
            {VIDEO.width} × {VIDEO.height}
          </Row>
          <Row label="Frame rate">{VIDEO.fps} fps</Row>
          <Row label="Codec">H.264 · AAC {QUALITY_PRESETS[project.exportSettings.quality].audioBitrate}</Row>
          <Row label="Container">MP4 · fast start</Row>
        </dl>
        <p className="mt-2.5 text-xs text-fg-3">Quality applies to every beat in this project.</p>
      </Section>

      <Section title="Audio">
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
          <Row label="File">
            <span title={a.originalFilename}>{a.originalFilename}</span>
          </Row>
          <Row label="Duration">{formatDuration(a.duration)}</Row>
          <Row label="Format">
            {a.format.toUpperCase()} · {a.codec}
          </Row>
          {a.sampleRate && <Row label="Sample rate">{(a.sampleRate / 1000).toFixed(1)} kHz</Row>}
          {a.bitDepth && <Row label="Bit depth">{a.bitDepth}-bit</Row>}
          {a.channels && <Row label="Channels">{a.channels === 1 ? 'Mono' : a.channels === 2 ? 'Stereo' : a.channels}</Row>}
          {a.bitRate && <Row label="Bitrate">{Math.round(a.bitRate / 1000)} kbps</Row>}
          <Row label="Size">{formatBytes(a.size)}</Row>
        </dl>
        <p className="mt-2.5 text-xs text-fg-3">Exported untouched — no normalising, fades or processing.</p>
      </Section>
    </aside>
  );
}
