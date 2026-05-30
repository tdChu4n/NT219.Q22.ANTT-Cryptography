import type { Movie } from '../data/movies';

function hexPattern(seed: number): string {
  let s = seed;
  const out: string[] = [];
  for (let i = 0; i < 400; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(s.toString(16).slice(0, 2).padStart(2, '0').toUpperCase());
  }
  return out.join(' ');
}

type BackdropProps = {
  movie: Movie;
  label?: string;
};

export const Backdrop = ({ movie, label }: BackdropProps) => (
  <div className={`backdrop ${movie.tint}`} style={{ width: '100%', height: '100%' }}>
    <div className="backdrop-stripes" />
    <div
      className="poster-hex"
      style={{ fontSize: 10, lineHeight: '16px', color: 'rgba(91, 140, 255, 0.06)' }}
    >
      {hexPattern(movie.id.charCodeAt(0) * 50)}
    </div>
    <div className="backdrop-label">{label ?? `BACKDROP · ${movie.id.toUpperCase()}`}</div>
  </div>
);
