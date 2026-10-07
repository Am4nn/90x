import { ProofValue } from "@/components/landing/proof-value";
import { PROOF_ITEMS } from "@/lib/landing/proof";

/** The proof numbers as four small tiles, two by two: the phone's version of the proof strip. */
export function ProofTiles() {
  return (
    <dl aria-label="90x in numbers" className="m-0 grid flex-none grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
      {PROOF_ITEMS.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col-reverse gap-0.5 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <dt className="text-tag leading-snug font-medium text-text-2">{item.label}</dt>
          <dd className="m-0 font-display text-title font-bold tracking-close text-text tabular-nums">
            <ProofValue item={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
