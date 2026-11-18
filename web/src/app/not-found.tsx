import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">FARACODE / 404</span>
      <h1>این مسیر را پیدا نکردیم.</h1>
      <p>از نمای کلی به مسیر درست برگردید.</p>
      <Link href="/" className="button primary">
        بازگشت به نمای کلی
      </Link>
    </main>
  );
}
