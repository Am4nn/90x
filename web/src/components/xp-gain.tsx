/** The small confirmation after an action that earned points: "+30 XP", and the
 *  day bonus beside it when the action finished the day. Renders nothing for 0.
 *  The amounts are the whole message: no caps, no formulas. */
export function XpGain({ xp = 0, bonus = 0 }: { xp?: number; bonus?: number }) {
  if (xp <= 0 && bonus <= 0) return null;
  return (
    <p role="status" className="tabular flex flex-wrap items-center gap-x-3 text-small font-semibold text-ok">
      {xp > 0 && <span>+{xp} XP</span>}
      {bonus > 0 && <span>+{bonus} XP for finishing the day</span>}
    </p>
  );
}
