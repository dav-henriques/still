import { cropToBoxStyle, type Artwork, type Crop } from '@still/shared';
import { ImageOff } from 'lucide-react';
import { urls } from '../../lib/api';
import { cn } from '../../lib/utils';

/** Square artwork rendered with the same crop math the export uses. */
export function CroppedArt({
  projectId,
  artwork,
  crop,
  size,
  variant = 'thumb',
  className,
}: {
  projectId: string;
  artwork: Artwork | undefined | null;
  crop: Crop;
  size: number;
  variant?: 'thumb' | 'display';
  className?: string;
}) {
  if (!artwork) {
    return (
      <div className={cn('flex shrink-0 items-center justify-center rounded-[5px] bg-surface-2 text-fg-3', className)} style={{ width: size, height: size }}>
        <ImageOff size={Math.round(size * 0.4)} strokeWidth={1.5} aria-hidden />
      </div>
    );
  }
  const s = cropToBoxStyle(artwork.width, artwork.height, crop, size);
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-[5px] bg-black', className)} style={{ width: size, height: size }}>
      <img
        src={urls.artwork(projectId, artwork.id, variant)}
        alt=""
        draggable={false}
        decoding="async"
        loading="lazy"
        className="absolute top-0 left-0 max-w-none"
        style={{ width: s.width, height: s.height, transform: `translate(${s.offsetX}px, ${s.offsetY}px)` }}
      />
    </div>
  );
}
