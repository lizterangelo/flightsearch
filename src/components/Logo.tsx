import Link from "next/link";

/**
 * The Soar lockup, built from the real /logo.svg (403×141: bitmap plane +
 * vector wordmark) shown at 33px tall, split into two crops so the plane
 * can fly on hover: it exits up-and-right, wraps around, and lands again
 * (extracted `logo-plane-loop` keyframe, 0.64s linear).
 */
export default function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  const img =
    "h-[33px] w-auto max-w-none [filter:brightness(0)_invert(1)] select-none";

  return (
    <Link
      href="/"
      aria-label="Soar home"
      className="logo group flex select-none items-center opacity-95 transition hover:opacity-100"
    >
      <span className="logo-lockup relative block h-[33px] w-[99px] overflow-visible">
        <span className="logo-plane-crop absolute left-0 top-0 h-[33px] w-11 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt=""
            draggable={false}
            className={`${img} group-hover:animate-[logo-plane-loop_0.64s_linear_both]`}
          />
        </span>
        {withWordmark && (
          <span className="logo-word-crop absolute -top-0.5 left-12 h-[33px] w-[51px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Soar"
              draggable={false}
              className={`${img} -translate-x-11`}
            />
          </span>
        )}
      </span>
    </Link>
  );
}
