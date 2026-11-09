import { z } from 'zod';
import { ZOOM_MAX, ZOOM_MIN } from './constants.ts';
import { JOB_STATES } from './jobs.ts';

export const QualitySchema = z.enum(['standard', 'high', 'maximum']);
export type Quality = z.infer<typeof QualitySchema>;

export const CropSchema = z.object({
  zoom: z.number().min(ZOOM_MIN).max(ZOOM_MAX),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const IdSchema = z.string().regex(/^[a-z0-9]{8,32}$/, 'Invalid id');

export const AudioInfoSchema = z.object({
  file: z.string(), // stored filename inside the project's audio/ folder
  originalFilename: z.string(),
  format: z.string(), // file extension, e.g. "wav"
  codec: z.string(),
  sampleRate: z.number().nullable(),
  channels: z.number().nullable(),
  bitRate: z.number().nullable(),
  bitDepth: z.number().nullable(),
  duration: z.number(),
  size: z.number(),
  playbackFile: z.string().nullable(), // browser-playable proxy when Chrome can't decode the source (e.g. AIFF)
});
export type AudioInfo = z.infer<typeof AudioInfoSchema>;

export const ArtworkSchema = z.object({
  id: IdSchema,
  file: z.string(), // render source: the original, or an orientation-corrected lossless copy
  originalFilename: z.string(),
  format: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  size: z.number(),
  displayFile: z.string(),
  thumbFile: z.string(),
  createdAt: z.string(),
});
export type Artwork = z.infer<typeof ArtworkSchema>;

export const BeatSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  audio: AudioInfoSchema,
  artworkId: IdSchema.nullable(),
  crop: CropSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Beat = z.infer<typeof BeatSchema>;

export const ExportPrefsSchema = z.object({ quality: QualitySchema });

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: z.string().min(1).max(120),
  createdAt: z.string(),
  updatedAt: z.string(),
  beats: z.array(BeatSchema),
  artworks: z.record(z.string(), ArtworkSchema),
  exportSettings: ExportPrefsSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  beatCount: number;
  totalDuration: number;
  artworkThumbs: string[]; // up to 4 artwork ids (thumb URLs are derived client-side)
}

export const JobStateSchema = z.enum(JOB_STATES);

export const ExportJobSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  beatId: IdSchema,
  projectName: z.string(),
  beatName: z.string(),
  artworkId: IdSchema.nullable(),
  quality: QualitySchema,
  state: JobStateSchema,
  progress: z.number().min(0).max(1),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  tempPath: z.string().nullable(),
  error: z.object({ message: z.string(), details: z.string().nullable() }).nullable(),
  output: z.object({ path: z.string(), filename: z.string(), size: z.number(), duration: z.number() }).nullable(),
});
export type ExportJob = z.infer<typeof ExportJobSchema>;

export const SettingsSchema = z.object({
  defaultQuality: QualitySchema,
  outputDir: z.string().nullable(), // null = managed exports folder
  projectView: z.enum(['list', 'grid']),
  ffmpegPath: z.string().nullable(),
  ffprobePath: z.string().nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

// ── Request payloads ─────────────────────────────────────────────
export const CreateProjectBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  quality: QualitySchema.optional(),
});
export const UpdateProjectBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  exportSettings: ExportPrefsSchema.optional(),
});
export const UpdateBeatBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  crop: CropSchema.optional(),
  artworkId: IdSchema.nullable().optional(),
});
export const RemoveBeatsBody = z.object({ beatIds: z.array(IdSchema).min(1) });
export const CreateExportsBody = z.object({ beatIds: z.array(IdSchema).min(1), quality: QualitySchema });
export const UpdateSettingsBody = SettingsSchema.partial();

// ── Server → client events ───────────────────────────────────────
export type ServerEvent =
  | { type: 'job'; job: ExportJob }
  | { type: 'job-removed'; jobId: string }
  | { type: 'project'; projectId: string };

export interface BinaryStatus {
  available: boolean;
  path: string | null;
  version: string | null;
  source: 'settings' | 'env' | 'path' | 'bundled' | null;
}

export interface SystemStatus {
  ffmpeg: BinaryStatus;
  ffprobe: BinaryStatus;
  ready: boolean;
  dataDir: string;
  projectsDir: string;
  exportsDir: string;
  outputDir: string;
  tempDir: string;
  tempBytes: number;
  platform: string;
  version: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: string };
}
