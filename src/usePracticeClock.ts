import { useEffect, useRef, useState } from "react";
export function usePracticeClock(key: string, restoredSeconds?: number) {
  const [seconds, setSeconds] = useState(
    () => restoredSeconds ?? Number(sessionStorage.getItem(key) || 0),
  );
  const [running, setRunning] = useState(false);
  const base = useRef(seconds),
    began = useRef(0),
    current = useRef(seconds);
  const pause = () => {
    if (began.current) {
      base.current += (performance.now() - began.current) / 1000;
      began.current = 0;
      current.current = base.current;
      setSeconds(base.current);
      sessionStorage.setItem(key, String(base.current));
    }
    setRunning(false);
  };
  const start = () => {
    if (!began.current) {
      began.current = performance.now();
      setRunning(true);
    }
  };
  const reset = () => {
    base.current = 0;
    began.current = 0;
    current.current = 0;
    setSeconds(0);
    setRunning(false);
    sessionStorage.removeItem(key);
  };
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      current.current =
        base.current + (performance.now() - began.current) / 1000;
      setSeconds(current.current);
      sessionStorage.setItem(key, String(current.current));
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [running, key]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    if (running && navigator.wakeLock)
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [running]);
  return {
    seconds,
    running,
    start,
    pause,
    reset,
    value: () =>
      Math.floor(
        began.current
          ? base.current + (performance.now() - began.current) / 1000
          : current.current,
      ),
  };
}
