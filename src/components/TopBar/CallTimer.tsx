import { useEffect, useState } from "react";
import { formatClock } from "../../lib/format";

/** mm:ss since `startedAt`; shows 00:00 when no call is running. Re-renders only itself. */
export function CallTimer({
  startedAt,
  className,
}: {
  startedAt: number | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <span className={className}>{startedAt === null ? "00:00" : formatClock(now - startedAt)}</span>
  );
}
