// Moves the Feed wall's columns. Each column holds the same cards twice, one set under
// the other (or beside it, on a phone), and slides by less than one set's length before
// starting over, which is why the loop has no seam. Runs only while the wall is on screen.
import { columnShift, drift, smoothSpeed } from "./wall";

const FRAME_MS = 33;

export function startWallMotion(wall: HTMLElement): () => void {
  const columns = [...wall.querySelectorAll<HTMLElement>("[data-wall-column]")];
  const periods: number[] = [];
  const sideways: boolean[] = [];
  let offset = 0;
  let speed = 0;
  let scrollY = window.scrollY;
  let last = 0;
  let frame = 0;
  let visible = false;

  // One set's length plus the gap after it: where the second set starts. Down the page on a
  // wide screen, across it on a phone, where the rows lie on their side.
  function measure() {
    columns.forEach((column, index) => {
      const [first, second] = column.children as HTMLCollectionOf<HTMLElement>;
      sideways[index] = getComputedStyle(column).flexDirection === "row";
      periods[index] = !first || !second ? 0 : sideways[index] ? second.offsetLeft - first.offsetLeft : second.offsetTop - first.offsetTop;
    });
  }

  function place() {
    columns.forEach((column, index) => {
      const shift = columnShift(index, offset, periods[index] ?? 0);
      column.style.transform = sideways[index] ? `translateX(${shift}px)` : `translateY(${shift}px)`;
    });
  }

  function tick(now: number) {
    frame = 0;
    if (!visible) return;
    const elapsed = last ? Math.min(100, now - last) : 0;
    if (!last || elapsed >= FRAME_MS) {
      // The page's own scroll speeds the wall up: pixels moved, per 60Hz frame, however long this one took.
      const moved = elapsed ? ((window.scrollY - scrollY) * 16.7) / elapsed : 0;
      speed = smoothSpeed(speed, moved);
      scrollY = window.scrollY;
      offset = drift(offset, elapsed, speed);
      last = now;
      place();
    }
    frame = requestAnimationFrame(tick);
  }

  const resize = new ResizeObserver(() => {
    measure();
    place();
  });
  columns.forEach((column) => resize.observe(column));
  measure();

  const watch = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible && !frame) {
      last = 0;
      scrollY = window.scrollY;
      frame = requestAnimationFrame(tick);
    }
  });
  watch.observe(wall);

  return () => {
    watch.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
    columns.forEach((column) => column.style.removeProperty("transform"));
  };
}
