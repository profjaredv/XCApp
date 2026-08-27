import { useEffect, useState } from 'react';
import { todayIso } from '@/lib/formatUtils';

// "Today" as a value that actually changes when today does.
//
// The bug this exists for: a coach reported opening the app in the morning
// and seeing YESTERDAY's practice. The date was being computed inline during
// render, which is correct exactly once — on a phone the app is not reloaded
// overnight, it is resumed. react-query does refetch on window focus, but it
// refetches THE KEY IT ALREADY HAS: nothing re-renders the component with a
// new date, so the query key still says yesterday and the "refresh" faithfully
// re-fetches yesterday's plan.
//
// So the day has to be state, and something has to change it:
//   - a timer armed for the next local midnight (app left open through it), and
//   - focus/visibilitychange (the common case — phone woken the next morning),
//     which is also when react-query refetches, so the new key and the refetch
//     line up.
export function useTodayIso(): string {
  const [today, setToday] = useState(todayIso);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const check = () => setToday((prev) => (prev === todayIso() ? prev : todayIso()));

    // Re-arm on every fire rather than using an interval: a single interval
    // drifts, and a device suspended across midnight would fire it late
    // anyway — the focus handler is what really covers that case.
    const armMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => {
        check();
        armMidnight();
      }, nextMidnight.getTime() - now.getTime());
    };
    armMidnight();

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}
