import type { Movie } from '../data/movies';
import { Icon } from './Icon';

function hexPattern(seed: number): string {
  let s = seed;
  const out: string[] = [];
  for (let i = 0; i < 400; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(s.toString(16).slice(0, 2).padStart(2, '0').toUpperCase());
  }
  return out.join(' ');
}

type PosterProps = {
  movie: Movie;
  w?: number | string;
  aspect?: string;
  label?: string | null;
  badge?: boolean;
  title?: boolean;
};

export const Poster = ({
  movie,
  w = 'auto',
  aspect = '2/3',
  label = null,
  badge = true,
  title = true,
}: PosterProps) => (
  <div
    className={`poster ${movie.tint}`}
    style={{ width: typeof w === 'number' ? `${w}px` : w, aspectRatio: aspect }}
  >
    <div className="poster-stripes" />
    <div className="poster-hex">{hexPattern(movie.id.charCodeAt(0) * 100)}</div>
    <div className="poster-grad" />
    <div className="poster-inner">
      <div className="poster-label">{label ?? `STILL · ${movie.id.toUpperCase()}`}</div>
    </div>
    {badge && (
      <div className="poster-badge">
        {movie.drm
          ? <span className="badge drm"><Icon name="lock" size={10} stroke={2} />DRM</span>
          : <span className="badge clear">CLEAR</span>}
      </div>
    )}
    {title && <div className="poster-title">{movie.title}</div>}
  </div>
);
