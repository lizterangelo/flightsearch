/**
 * Boot loader: black screen with the logo and a holographic shimmer band
 * sweeping across it (styles in soar-theme.css), fading out once the app
 * is interactive. Server-rendered so it paints before hydration.
 */
export default function AppLoader() {
  return (
    <>
      <div id="app-loader" aria-hidden>
        <span className="app-loader-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" />
          <span className="app-loader-shimmer" />
        </span>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var done=false;function ready(){if(done)return;done=true;document.documentElement.setAttribute("data-app-ready","1");setTimeout(function(){document.documentElement.setAttribute("data-app-loader-removed","1")},260)}if(document.readyState==="complete")setTimeout(ready,120);else window.addEventListener("load",function(){setTimeout(ready,120)});setTimeout(ready,2500)})();`,
        }}
      />
    </>
  );
}
