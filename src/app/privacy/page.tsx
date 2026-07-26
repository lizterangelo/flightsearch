export const metadata = { title: "Soar — Privacy" };

const h2 = "mt-8 text-lg font-semibold text-white";
const p = "mt-2 text-[15px] leading-relaxed text-slate-300";

/** Short original stand-in prose for the study clone. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
      <h1 className="mt-6 text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted">Demo build — not a real product.</p>

      <h2 className={h2}>Sign-in</h2>
      <p className={p}>
        Sign-in uses your Google account via Supabase Auth. We receive your
        name, email, and avatar — never your password.
      </p>

      <h2 className={h2}>What we store</h2>
      <p className={p}>
        Your profile, saved travelers, test bookings, watches, and cached
        fare observations live in a Supabase Postgres project owned by
        whoever runs this build, with row-level security scoping every row
        to your account. Nothing is sent to any analytics service.
      </p>

      <h2 className={h2}>What Duffel sees</h2>
      <p className={p}>
        Searches and test bookings are sent to the Duffel sandbox API,
        including the passenger details you type at checkout. In this build
        those should be made-up details, not real personal data.
      </p>

      <h2 className={h2}>Location</h2>
      <p className={p}>
        The &quot;From&quot; field can use your browser&apos;s location, only when you allow
        it, and only to pick the nearest airport. Coordinates are used for
        that lookup and not stored.
      </p>

      <h2 className={h2}>Deleting data</h2>
      <p className={p}>
        Settings → Delete account removes your auth user and cascades away
        every row you own — profile, bookings, friends, cards, and watches.
      </p>
    </main>
  );
}
