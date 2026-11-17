import { THRESHOLD, cx, pct } from '../utils/format';

/**
 * Attendance meter with a fixed notch at the required threshold, so a student can see
 * at a glance how far above or below the line they are.
 */
export default function AttendanceBar({ value = 0, counted = 1, threshold = THRESHOLD, showLabel = true }) {
  const hasData = counted > 0;
  const low = hasData && value < threshold;
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div>
      <div
        className="relative h-3 rounded-full bg-ink-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasData ? value : 0}
        aria-label={hasData ? `Attendance ${pct(value)}, required ${threshold}%` : 'No classes held yet'}
      >
        <div className={cx('h-full rounded-full', !hasData ? 'bg-transparent' : low ? 'bg-shortage' : 'bg-healthy')} style={{ width: `${hasData ? width : 0}%` }} />
        <span className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${threshold}%` }} title={`${threshold}% required`} />
      </div>
      {showLabel && (
        <div className="mt-1.5 flex justify-between text-xs text-muted">
          <span className={cx('font-semibold tabular-nums', low ? 'text-shortage' : hasData ? 'text-healthy' : 'text-muted')}>{hasData ? pct(value) : 'No classes yet'}</span>
          <span>{threshold}% required</span>
        </div>
      )}
    </div>
  );
}
