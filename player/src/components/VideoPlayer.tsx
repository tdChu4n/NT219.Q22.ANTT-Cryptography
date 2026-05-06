import { forwardRef } from 'react';
import styles from './VideoPlayer.module.css';
import type { ShakaStatus } from '../hooks/useShakaPlayer';

type Props = {
  status: ShakaStatus;
  error: string | null;
  poster?: string;
  /** Click khung hình → toggle play/pause để demo trực quan. */
  onTogglePlay?: () => void;
  /** Double-click → fullscreen. */
  onFullscreen?: () => void;
  /** Hiển thị icon paused giữa khung khi đang dừng (không cản keyboard). */
  paused?: boolean;
};

const VideoPlayer = forwardRef<HTMLVideoElement, Props>(function VideoPlayer(
  { status, error, poster, onTogglePlay, onFullscreen, paused },
  ref,
) {
  return (
    <div
      className={styles.wrap}
      id="player"
      onClick={onTogglePlay}
      onDoubleClick={onFullscreen}
    >
      <video
        ref={ref}
        className={styles.video}
        playsInline
        poster={poster}
      >
        Trình duyệt của bạn không hỗ trợ thẻ &lt;video&gt;.
      </video>

      {/* Big-play indicator chỉ hiển thị khi đang ready & paused — gợi ý click. */}
      {status === 'ready' && paused && (
        <div className={styles.bigPlay} aria-hidden>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r="30" fill="rgba(11, 14, 20, 0.55)" />
            <path d="M26 18 L48 32 L26 46 Z" fill="#fff" />
          </svg>
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.overlay}>
          <div className={styles.spinner} aria-hidden />
          <span>Đang tải manifest…</span>
        </div>
      )}

      {status === 'error' && (
        <div className={`${styles.overlay} ${styles.overlayError}`}>
          <strong>⚠ Lỗi khi tải manifest</strong>
          <code className={styles.errorDetail}>{error ?? 'Unknown error'}</code>
        </div>
      )}

      {status === 'idle' && (
        <div className={styles.overlay}>
          <span>Chọn một manifest ở panel bên phải để bắt đầu</span>
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
