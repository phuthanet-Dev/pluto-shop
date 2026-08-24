import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found" id="main-content">
      <span className="state-code">404 / OUTER ORBIT</span>
      <div className="not-found-orbit" aria-hidden="true">
        <span />
      </div>
      <h1>Lost beyond Pluto</h1>
      <p>The page you requested is not part of this catalog.</p>
      <Link className="primary-button" href="/th">
        Return to Pluto Shop
      </Link>
    </main>
  );
}
