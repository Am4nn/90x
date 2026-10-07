import { ProofValue } from "@/components/landing/proof-value";
import { PROOF_ITEMS } from "@/lib/landing/proof";

/** Four true numbers between the pinned demo and the Feed wall. A term list, so a reader hears "3,693, problems". Desktop only: the phone has its own tiles. */
export function ProofStrip() {
  return (
    <section data-landing="proof" aria-label="90x in numbers" className="relative z-1 border-t border-line @max-wide:hidden">
      <dl className="mx-auto grid max-w-content grid-cols-4 px-gutter">
        {PROOF_ITEMS.map((item, i) => (
          <div key={item.label} className={`flex min-w-0 flex-col-reverse gap-2 px-6 py-7 ${i === 0 ? "pl-0" : "border-l border-line"}`}>
            <dt className="text-small font-medium text-text-2">{item.label}</dt>
            <dd className="font-display text-proof font-bold tracking-close text-text tabular-nums">
              <ProofValue item={item} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
