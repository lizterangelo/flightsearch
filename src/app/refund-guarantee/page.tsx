export const metadata = { title: "Soar — Refund Guarantee" };

const h2 = "mt-8 text-lg font-semibold text-white";
const p = "mt-2 text-[15px] leading-relaxed text-slate-300";

/** Short original stand-in prose for the study clone. */
export default function RefundGuaranteePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
      <h1 className="mt-6 text-3xl font-bold text-white">Refund Guarantee</h1>
      <p className="mt-1 text-sm text-muted">Demo build — not a real product.</p>

      <h2 className={h2}>What it covers</h2>
      <p className={p}>
        Add Protect Flight to a booking and you can cancel it through Soar for
        any reason before the scheduled departure of your first flight. When
        you do, you get back everything you paid for the booking except the
        protection fee itself — even when the airline&apos;s fare rules would treat
        the ticket as non-refundable.
      </p>

      <h2 className={h2}>The cutoff</h2>
      <p className={p}>
        Eligibility ends at the scheduled departure time of the first flight
        in your itinerary, in that airport&apos;s local time. Missed or unused
        flights after that moment aren&apos;t covered, including connections and
        return legs.
      </p>

      <h2 className={h2}>How to use it</h2>
      <p className={p}>
        Open the booking under My Flights and cancel there before the cutoff.
        Cancelling directly with the airline or through anyone else falls back
        to the airline&apos;s own fare rules.
      </p>

      <h2 className={h2}>What you get back</h2>
      <p className={p}>
        The amount you paid for the flight including taxes and fees, minus the
        Protect Flight fee. Refunds go to the original payment method. In this
        demo build, payments come from a Duffel sandbox balance, so refunds
        are sandbox refunds.
      </p>
    </main>
  );
}
