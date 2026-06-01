import type { Movie } from '../data/movies';
import { Icon } from './Icon';

type PosterProps = {
  movie: Movie;
  w?: number | string;
  aspect?: string;
  badge?: boolean;
  title?: boolean;
};

export const Poster = ({
  movie,
  w = 'auto',
  aspect = '2/3',
  badge = true,
  title = true,
}: PosterProps) => (
  <div
    className={`poster ${movie.tint}`}
    style={{ width: typeof w === 'number' ? `${w}px` : w, aspectRatio: aspect }}
  >
    {movie.poster ? (
      <img
        src={movie.poster}
        alt={movie.title}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        loading="lazy"
      />
    ) : (
      <>
        <div className="poster-stripes" />
        <div className="poster-hex">
          {Array.from({ length: 200 }, (_, i) => ((i * 9301 + 49297) % 233280).toString(16).slice(0, 2).toUpperCase()).join(' ')}
        </div>
      </>
    )}
    <div className="poster-grad" />
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
