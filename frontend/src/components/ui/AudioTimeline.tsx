import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';

/**
 * Pick the slice of audio to animate, by looking at it and hearing it.
 *
 * This replaces two blind range sliders - "audio start" 0-120s and "video
 * length" 0-600s - that asked which second to cut at with nothing to cut
 * against. You guessed, generated, watched, and guessed again.
 *
 * The waveform is drawn from the decoded samples, so the phrase you are
 * aiming at is visible. Play runs only the selected range, so you hear
 * exactly what the clip will cover before spending a generation on it.
 *
 * `end` keeps the page's existing meaning: 0 is "to the end of the audio",
 * not "zero seconds".
 */

interface Props {
  /** URL of the audio to read. Null renders the empty state. */
  src: string | null;
  start: number;
  /** Absolute end position in seconds; 0 means play to the end. */
  end: number;
  onChange: (start: number, end: number) => void;
  /** The clip's real length, once decoded. Lets a caller check its own
   *  start/end against something other than a guess. */
  onDuration?: (seconds: number) => void;
}

const HEIGHT = 72;
const COLUMNS = 320;

function fmt(s: number): string {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function AudioTimeline({ src, start, end, onChange, onDuration }: Props) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  // The effective end, resolving the 0 sentinel against the real duration.
  const endAt = end > 0 ? Math.min(end, duration || end) : duration;

  // ── decode ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!src) { setPeaks(null); setDuration(0); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buf);
        void ctx.close();
        if (cancelled) return;

        // One column per pixel-ish, taking the loudest sample in each bucket -
        // averaging flattens speech into a featureless band and the point is
        // to see where the phrases are.
        const data = decoded.getChannelData(0);
        const per = Math.max(1, Math.floor(data.length / COLUMNS));
        const out: number[] = [];
        for (let i = 0; i < COLUMNS; i++) {
          let peak = 0;
          const base = i * per;
          for (let j = 0; j < per; j += 4) {
            const v = Math.abs(data[base + j] || 0);
            if (v > peak) peak = v;
          }
          out.push(peak);
        }
        const max = Math.max(...out, 0.01);
        setPeaks(out.map((v) => v / max));
        setDuration(decoded.duration);
        onDuration?.(decoded.duration);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not read that audio');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  // ── draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    // Backing store scaled to the device: at 150% browser zoom an unscaled
    // canvas draws a blurred waveform.
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, HEIGHT);

    const x0 = duration ? (start / duration) * w : 0;
    const x1 = duration ? (endAt / duration) * w : w;

    const mid = HEIGHT / 2;
    const bw = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * bw;
      const h = Math.max(1, peaks[i] * (HEIGHT - 12));
      const inside = x >= x0 && x <= x1;
      g.fillStyle = inside ? 'rgba(167,139,250,0.85)' : 'rgba(255,255,255,0.13)';
      g.fillRect(x, mid - h / 2, Math.max(1, bw - 0.5), h);
    }

    // Dim what will not be animated, rather than only brightening what will:
    // the excluded part should read as switched off.
    g.fillStyle = 'rgba(5,5,6,0.55)';
    g.fillRect(0, 0, x0, HEIGHT);
    g.fillRect(x1, 0, w - x1, HEIGHT);

    for (const x of [x0, x1]) {
      g.fillStyle = 'rgba(167,139,250,0.95)';
      g.fillRect(x - 1, 0, 2, HEIGHT);
    }

    if (playhead != null && duration) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect((playhead / duration) * w - 0.5, 0, 1, HEIGHT);
    }
  }, [peaks, start, endAt, duration, playhead]);

  // ── interaction ───────────────────────────────────────────────────────────
  const secondsAt = useCallback((clientX: number) => {
    const el = canvasRef.current;
    if (!el || !duration) return 0;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return ratio * duration;
  }, [duration]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!duration) return;
    const t = secondsAt(e.clientX);
    // Grab whichever handle is nearer, unless the click is well clear of both,
    // in which case it is a scrub.
    const grabWindow = duration * 0.04;
    const nearStart = Math.abs(t - start) < grabWindow;
    const nearEnd = Math.abs(t - endAt) < grabWindow;
    if (nearStart || nearEnd) {
      dragging.current = nearStart && (!nearEnd || Math.abs(t - start) <= Math.abs(t - endAt)) ? 'start' : 'end';
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      return;
    }
    seek(t);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current || !duration) return;
    const t = secondsAt(e.clientX);
    if (dragging.current === 'start') {
      onChange(Math.min(t, endAt - 0.2), end);
    } else {
      // Snapping the far edge back to 0 keeps "to end of audio" reachable by
      // dragging, not only by never having touched it.
      const atEnd = t >= duration - 0.15;
      onChange(start, atEnd ? 0 : Math.max(t, start + 0.2));
    }
  };

  const onPointerUp = () => { dragging.current = null; };

  const seek = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setPlayhead(t);
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); return; }
    if (a.currentTime < start || a.currentTime >= endAt) a.currentTime = start;
    void a.play();
  };

  // Playback stops at the selection's edge: hearing past the cut is what made
  // the sliders untrustworthy in the first place.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setPlayhead(a.currentTime);
      if (a.currentTime >= endAt) { a.pause(); a.currentTime = start; }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, [start, endAt]);

  if (!src) {
    return (
      <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-white/25">
        Load an audio clip to choose the part to animate.
      </p>
    );
  }

  const selected = Math.max(0, endAt - start);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Audio range
        </span>
        <span className="font-mono text-[11px] text-zinc-300">
          {fmt(start)} – {end > 0 ? fmt(endAt) : 'end'} · {selected.toFixed(1)}s
        </span>
      </div>

      <div className="relative rounded-lg border border-white/10 bg-black/30 p-2">
        {loading && (
          <div className="flex h-[72px] items-center justify-center gap-2 text-[11px] text-white/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading audio…
          </div>
        )}
        {error && !loading && (
          <p className="flex h-[72px] items-center justify-center text-[11px] text-amber-300/70">{error}</p>
        )}
        {!loading && !error && (
          <canvas
            ref={canvasRef}
            style={{ height: HEIGHT }}
            className="w-full cursor-pointer touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!peaks}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? 'Pause' : 'Play selection'}
        </button>
        <span className="text-[10px] text-white/25">
          Drag the edges to trim · click to scrub · total {fmt(duration)}
        </span>
      </div>

      <audio ref={audioRef} src={src} preload="auto" className="hidden" />
    </div>
  );
}
