import Link from "next/link";
import { formatMoney } from "@/lib/currency";
import type { FlightOffer } from "@/lib/types";

/** Right rail: per-traveler price, total for all pax, Book pill. */
export default function PriceBlock({
  offer,
  adults,
}: {
  offer: FlightOffer;
  adults: number;
}) {
  const { price } = offer;
  const bookCls =
    "rounded-full bg-accent px-7 py-2.5 text-center text-[15px] font-semibold text-white shadow-[0_0_18px_rgba(46,107,255,0.4)] transition hover:brightness-110";

  return (
    <div className="flex w-40 shrink-0 flex-col items-end justify-between gap-3 self-stretch py-1">
      <div className="text-right">
        <div className="text-[26px] leading-8 font-bold text-white">
          {formatMoney(price.perTraveler, price.currency)}
        </div>
        {adults > 1 && (
          <div className="text-xs text-muted">
            {formatMoney(price.total, price.currency)} total
          </div>
        )}
        {price.currency !== "USD" && (
          <div className="text-xs text-muted">
            ≈ {formatMoney(price.totalUSD, "USD")}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        {offer.splitTicket ? (
          <>
            <a
              href={offer.splitTicket.outbound.deeplink}
              target="_blank"
              rel="noopener noreferrer"
              className={`${bookCls} !px-5 !py-2 text-[13px]`}
            >
              Book outbound
            </a>
            <a
              href={offer.splitTicket.return.deeplink}
              target="_blank"
              rel="noopener noreferrer"
              className={`${bookCls} !px-5 !py-2 text-[13px]`}
            >
              Book return
            </a>
            <span className="text-[10px] font-medium text-muted">
              Two separate bookings
            </span>
          </>
        ) : offer.bookable ? (
          <>
            <Link href={`/book/${offer.bookable.offerId}`} className={bookCls}>
              Book
            </Link>
            <span className="text-[10px] font-medium text-direct">
              Instant booking — no redirect
            </span>
          </>
        ) : (
          <a
            href={offer.deeplink}
            target="_blank"
            rel="noopener noreferrer"
            className={bookCls}
          >
            Book
          </a>
        )}
      </div>
    </div>
  );
}
