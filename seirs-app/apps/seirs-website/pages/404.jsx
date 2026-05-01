export default function Custom404() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", backgroundColor: "#F5F5F0" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 64, height: 64, background: "#0F2B4C", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: "1.5rem" }}>S</span>
        </div>
        <h1 style={{ fontSize: "6rem", fontWeight: 900, color: "#0F2B4C", margin: 0 }}>404</h1>
        <p style={{ color: "#6B7280", fontSize: "1.125rem", marginBottom: "2rem" }}>
          This page doesn&apos;t exist.
        </p>
        <a href="/" style={{ background: "#0F2B4C", color: "#fff", fontWeight: 700, padding: "1rem 2rem", borderRadius: "0.5rem", textDecoration: "none" }}>
          Back to Home
        </a>
      </div>
    </div>
  );
}
