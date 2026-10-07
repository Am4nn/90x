import { BRAND_COLORS as C } from "@/lib/brand/mark";
import type { CardModel, SquareStatus } from "@/lib/share/card-data";
import { gridLayout } from "@/lib/share/grid";

// The 1200x630 share card, drawn to the approved design.
// Satori takes inline styles only, so the colours come from the shared brand constants
// and the grid is rows of flex squares. It shows nothing but the model it is given.

// Half-strength accent for revived crosses (the app's color-mix, which Satori lacks).
const ACCENT_HALF = `${C.accent}8c`;

function squareBackground(s: SquareStatus): string {
  if (s === "done" || s === "revived") return C.accentBg;
  if (s === "partial") return `linear-gradient(135deg, ${C.accentBg} 50%, ${C.surface2} 50%)`;
  if (s === "missed" || s === "rest") return "transparent";
  return C.surface2;
}

// Missed and rest are outlined, rest fainter, as the app draws them.
function squareBorder(s: SquareStatus): { border: string } | undefined {
  if (s === "missed") return { border: `1px solid ${C.line2}` };
  if (s === "rest") return { border: `1px solid ${C.line}` };
  return undefined;
}

// Below the approved 44px size the rotated bars clip, so the X is one SVG path scaled to the square.
// The 44px card keeps the original bars, so it is unchanged.
const FULL_SIZE = 44;

function CrossSvg({ color, sq }: { color: string; sq: number }) {
  const inset = Math.max(2, sq * 0.22);
  const far = sq - inset;
  return (
    <svg width={sq} height={sq} viewBox={`0 0 ${sq} ${sq}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <path
        d={`M${inset} ${inset}L${far} ${far}M${far} ${inset}L${inset} ${far}`}
        stroke={color}
        strokeWidth={Math.max(1.5, sq * 0.07)}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Cross({ color, angle, sq }: { color: string; angle: number; sq: number }) {
  const inset = (8 * sq) / 44;
  const thick = Math.max(1, (3 * sq) / 44);
  return (
    <div
      style={{
        position: "absolute",
        left: inset,
        top: sq / 2 - thick / 2,
        width: sq - inset * 2,
        height: thick,
        borderRadius: thick / 2,
        background: color,
        transform: `rotate(${angle}deg)`,
      }}
    />
  );
}

function Square({ status, today, sq }: { status: SquareStatus; today: boolean; sq: number }) {
  const ring = Math.max(2, Math.round((4 * sq) / 44));
  const crossed = status === "done" || status === "revived";
  const mark = status === "revived" ? ACCENT_HALF : C.accent;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: sq,
        height: sq,
        borderRadius: sq >= 30 ? 3 : 2,
        background: squareBackground(status),
        ...squareBorder(status),
      }}
    >
      {crossed && sq === FULL_SIZE && <Cross color={mark} angle={45} sq={sq} />}
      {crossed && sq === FULL_SIZE && <Cross color={mark} angle={-45} sq={sq} />}
      {crossed && sq !== FULL_SIZE && <CrossSvg color={mark} sq={sq} />}
      {today && (
        <div
          style={{
            position: "absolute",
            top: -ring,
            left: -ring,
            width: sq + ring * 2,
            height: sq + ring * 2,
            borderRadius: sq >= 30 ? 6 : 4,
            border: `1.5px solid ${C.accent}`,
          }}
        />
      )}
    </div>
  );
}

function rows(squares: CardModel["squares"], perRow: number) {
  const out: CardModel["squares"][] = [];
  for (let i = 0; i < squares.length; i += perRow) out.push(squares.slice(i, i + perRow));
  return out;
}

export function ShareCard({ model, host }: { model: CardModel; host: string }) {
  const grid = gridLayout(model.squares.length);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        paddingLeft: 84,
        paddingRight: 84,
        background: C.bg,
        color: C.text,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 462 }}>
        <div style={{ display: "flex", fontFamily: "Sora", fontSize: 64, lineHeight: 1, letterSpacing: -1.3 }}>
          <span>90</span>
          <span style={{ color: C.accent }}>x</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 18,
              fontFamily: "Sora",
              fontSize: 72,
              lineHeight: 1,
              letterSpacing: -2.5,
            }}
          >
            <span>{`Day ${model.dayNumber}`}</span>
            <span style={{ color: C.mute }}>{`of ${model.total}`}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 22, fontFamily: "Manrope", fontSize: 32, color: C.text2 }}>
            <span>{`${model.done} done`}</span>
            {model.revived > 0 && <span style={{ color: C.mute }}>·</span>}
            {model.revived > 0 && <span style={{ color: C.accent }}>{`${model.revived} revived`}</span>}
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Manrope", fontSize: 28, color: C.text2 }}>{host}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: grid.gap }}>
        {rows(model.squares, grid.cols).map((row, r) => (
          <div key={r} style={{ display: "flex", gap: grid.gap }}>
            {row.map((s, i) => (
              <Square key={i} status={s.status} today={s.today} sq={grid.sq} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
