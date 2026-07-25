export const metadata = { title: "Soar — Terms" };

const h2 = "mt-8 text-lg font-semibold text-white";
const p = "mt-2 text-[15px] leading-relaxed text-slate-300";

/** Short original stand-in prose for the study clone. */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
      <h1 className="mt-6 text-3xl font-bold text-white">Terms of Service</h1>
      <p className="mt-1 text-sm text-muted">Demo build — not a real product.</p>

      <h2 className={h2}>What this is</h2>
      <p className={p}>
        This app is a local development build that searches and books flights
        against the Duffel sandbox. Fares are test data, payments use a test
        balance, and no real tickets are ever issued.
      </p>

      <h2 className={h2}>Your account</h2>
      <p className={p}>
        Signing in creates a local account tied to the phone number or email
        you enter. Keep access to it; anyone with your sign-in code can see
        your test bookings.
      </p>

      <h2 className={h2}>Bookings</h2>
      <p className={p}>
        Bookings are subject to the fare conditions shown before payment.
        Prices can change or expire between search and checkout — the total
        shown at payment is the one that counts.
      </p>

      <h2 className={h2}>Liability</h2>
      <p className={p}>
        This software is provided as-is for evaluation, without warranties of
        any kind. Don&apos;t rely on it for real travel.
      </p>
    </main>
  );
}
