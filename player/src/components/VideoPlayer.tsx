import { forwardRef } from 'react';
import styles from './VideoPlayer.module.css';
import type { ShakaStatus } from '../hooks/useShakaPlayer';

type Props = {
  status: ShakaStatus;
  error: string | null;
  poster?: string;
};

const VideoPlayer = forwardRef<HTMLVideoElement, Props>(function VideoPlayer(
  { status, error, poster },
  ref,
) {
  return (
    <div className={styles.wrap} id="player">
      <video
        ref={ref}
        className={styles.video}
        controls
        playsInline
        poster={poster}
      >
        Trình duyệt của bạn không hỗ trợ thẻ &lt;video&gt;.
      </video>

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
