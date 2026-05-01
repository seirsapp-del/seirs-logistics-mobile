import Link from "next/link";

export default function Custom404() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", backgroundColor: "#F5F5F0" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "6rem", fontWeight: 900, color: "#0F2B4C", margin: 0 }}>404</h1>
        <p style={{ color: "#6B7280", fontSize: "1.125rem", marginBottom: "2rem" }}>
          This page doesn&apos;t exist.
        </p>
        <Link href="/" style={{ background: "#0F2B4C", color: "#fff", fontWeight: 700, padding: "1rem 2rem", borderRadius: "0.5rem", textDecoration: "none" }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
