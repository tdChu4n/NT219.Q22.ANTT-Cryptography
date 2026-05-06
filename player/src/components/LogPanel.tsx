import { useMemo, useState } from 'react';
import type { LogEntry, LogLevel } from '../hooks/useShakaPlayer';
import styles from './LogPanel.module.css';

type Props = {
  logs: LogEntry[];
  onClear: () => void;
};

type LevelFilter = 'all' | LogLevel;

function levelLabel(l: LevelFilter): string {
  switch (l) {
    case 'all':
      return 'All';
    case 'info':
      return 'Info';
    case 'warn':
      return 'Warn';
    case 'error':
      return 'Error';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export default function LogPanel({ logs, onClear }: Props) {
  const [filter, setFilter] = useState<LevelFilter>('all');
  const [pause, setPause] = useState(false);
  const [snapshot, setSnapshot] = useState<LogEntry[] | null>(null);

  /**
   * Khi user bật pause → snapshot list hiện tại để các log mới không
   * cuộn vào view (giúp đọc kỹ trong demo). Khi tắt pause → bỏ snapshot.
   */
  const handleTogglePause = () => {
    setPause((p) => {
      const next = !p;
      setSnapshot(next ? logs : null);
      return next;
    });
  };

  const view = pause && snapshot ? snapshot : logs;
  const filtered = useMemo(
    () => (filter === 'all' ? view : view.filter((l) => l.level === filter)),
    [view, filter],
  );

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
    for (const l of view) c[l.level] += 1;
    return c;
  }, [view]);

  const handleCopy = () => {
    const text = filtered
      .slice()
      .reverse()
      .map(
        (l) =>
          `${formatTime(l.ts)} [${l.level.toUpperCase()}] (${l.kind}) ${l.message}`,
      )
      .join('\n');
    void navigator.clipboard?.writeText(text).catch(() => {
      // No clipboard permission — silently ignore (rare on dev http).
    });
  };

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h3 className={styles.title}>Event Log</h3>
        <span className={styles.subtitle}>
          {filtered.length}/{view.length} events
        </span>
      </header>

      <div className={styles.controls}>
        <div className={styles.filterRow} role="radiogroup" aria-label="Filter level">
          {(['all', 'info', 'warn', 'error'] as LevelFilter[]).map((l) => {
            const isActive = filter === l;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`${styles.filterBtn} ${
                  isActive ? styles.filterActive : ''
                } ${l !== 'all' ? styles[`level_${l}`] : ''}`}
                onClick={() => setFilter(l)}
              >
                {levelLabel(l)}
                {l !== 'all' && (
                  <span className={styles.filterCount}>
                    {counts[l as LogLevel]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${pause ? styles.pauseActive : ''}`}
            onClick={handleTogglePause}
            title="Tạm khoá log để đọc kỹ trong demo"
          >
            {pause ? '▶ Resume' : '❚❚ Pause'}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleCopy}
            disabled={filtered.length === 0}
            title="Copy log đã lọc vào clipboard"
          >
            ⎘ Copy
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onClear}
            disabled={view.length === 0}
            title="Xoá toàn bộ log"
          >
            ✕ Clear
          </button>
        </div>
      </div>

      <div className={styles.list} role="log" aria-live="polite">
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            Không có sự kiện trong bộ lọc hiện tại.
          </div>
        ) : (
          filtered.map((l) => (
            <div
              key={l.id}
              className={`${styles.row} ${styles[`row_${l.level}`]}`}
            >
              <span className={styles.ts}>{formatTime(l.ts)}</span>
              <span className={`${styles.kind} ${styles[`kind_${l.kind}`] ?? ''}`}>
                {l.kind}
              </span>
              <span className={styles.msg}>{l.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
