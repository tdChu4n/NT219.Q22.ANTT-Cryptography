import type { Movie } from '../data/movies';

type BackdropProps = {
  movie: Movie;
};

export const Backdrop = ({ movie }: BackdropProps) => (
  <div className={`backdrop ${movie.tint}`} style={{ width: '100%', height: '100%' }}>
    {movie.backdrop ? (
      <img
        src={movie.backdrop}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        loading="eager"
      />
    ) : (
      <>
        <div className="backdrop-stripes" />
        <div
          className="poster-hex"
          style={{ fontSize: 10, lineHeight: '16px', color: 'rgba(91, 140, 255, 0.06)' }}
        >
          {Array.from({ length: 300 }, (_, i) => ((i * 9301 + 49297) % 233280).toString(16).slice(0, 2).toUpperCase()).join(' ')}
        </div>
      </>
    )}
  </div>
);
