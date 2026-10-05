import { KIND_COUNT_WORD, WALL_CARDS } from "@/lib/landing/wall-cards";
import { FeedHeadline } from "./feed-headline";
import { FeedWall } from "./feed-wall";
import { Reveal } from "./reveal";
import { WallCard } from "./wall-card";

/** "A feed that grades you back": a wall of the Feed's kinds of card, drifting past. */
export function FeedSection() {
  return (
    <section data-landing="feed" className="relative z-1 border-t border-line">
      <div className="mx-auto flex max-w-content flex-col gap-feed-gap px-gutter pt-feed-top">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
            <FeedHeadline text="A feed that grades you back." />
            <p className="text-sub font-medium text-text-2">{KIND_COUNT_WORD} kinds of card. Every one marked.</p>
          </div>
        </Reveal>
        <Reveal late>
          <FeedWall
            cards={WALL_CARDS.map((card) => (
              <WallCard key={card.kind} card={card} />
            ))}
          />
        </Reveal>
      </div>
    </section>
  );
}
