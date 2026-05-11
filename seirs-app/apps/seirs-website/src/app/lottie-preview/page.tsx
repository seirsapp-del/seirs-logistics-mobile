import fs from "node:fs";
import path from "node:path";
import { LottieAnimation } from "@/components/LottieAnimation";

/**
 * Dev helper: previews every Lottie JSON dropped into src/animations/.
 *
 * Workflow when sourcing animations:
 *   1. Visit https://lottiefiles.com/featured-free-animations
 *      (or search for "delivery", "package", "courier", "wallet")
 *   2. Click an animation → "Download" → "Lottie JSON"
 *   3. Save to src/animations/<descriptive-name>.json
 *   4. Refresh this page (`/lottie-preview`) — it auto-discovers + renders all JSONs
 *   5. If you like it, copy the import line shown below the preview into the
 *      target marketing page (Homepage hero, /for-drivers, etc.)
 *
 * Once the marketing pages have their animations wired you can delete this
 * file — it's purely a development aid.
 */
export const dynamic = "force-dynamic";

export default async function LottiePreviewPage() {
  const animationsDir = path.join(process.cwd(), "src", "animations");

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(animationsDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    files = [];
  }

  // Load each JSON eagerly so we can pass the parsed object to the player.
  const animations = files.map((file) => {
    const fullPath = path.join(animationsDir, file);
    const raw = fs.readFileSync(fullPath, "utf-8");
    let data: object | null = null;
    let error: string | null = null;
    try { data = JSON.parse(raw); } catch (e: any) { error = e.message; }
    const sizeKb = Math.round(fs.statSync(fullPath).size / 1024);
    return { file, data, error, sizeKb };
  });

  return (
    <main className="min-h-screen bg-cloud px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-navy mb-2">Lottie preview</h1>
        <p className="text-gray-600 mb-8">
          Renders every <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">.json</code> in{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">src/animations/</code>.
          Drop new files in, refresh this page, and see them play. Dev-only — don&apos;t link from production nav.
        </p>

        {animations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
            <p className="text-lg mb-2">No animations yet.</p>
            <p className="text-sm">
              Browse{" "}
              <a
                href="https://lottiefiles.com/featured-free-animations"
                target="_blank"
                rel="noreferrer"
                className="text-sky underline"
              >
                lottiefiles.com/featured-free-animations
              </a>
              , download a Lottie JSON, save it as{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                src/animations/&lt;name&gt;.json
              </code>{" "}
              — then refresh this page.
            </p>
          </div>
        ) : (
          <div className="grid gap-8">
            {animations.map(({ file, data, error, sizeKb }) => (
              <div key={file} className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-navy font-mono">{file}</h2>
                  <span className={`text-xs px-2 py-1 rounded-full ${sizeKb > 200 ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {sizeKb} KB
                  </span>
                </div>

                {error ? (
                  <p className="text-red-600 text-sm font-mono">Parse error: {error}</p>
                ) : (
                  <>
                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-4">
                      <LottieAnimation
                        animationData={data!}
                        className="w-full max-w-md mx-auto aspect-square"
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      <p className="mb-1">Drop into a page:</p>
                      <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto text-[11px]">
{`import data from "@/animations/${file}";
import { LottieAnimation } from "@/components/LottieAnimation";

<LottieAnimation animationData={data} className="w-full max-w-md mx-auto" />`}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 bg-sky/5 border border-sky/20 rounded-2xl p-6">
          <h3 className="text-base font-bold text-navy mb-3">Recommended placements</h3>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• <strong>Homepage hero (right column)</strong> — search lottiefiles for &quot;delivery package map&quot; or &quot;motorcycle delivery&quot;</li>
            <li>• <strong>/how-it-works</strong> after the steps — &quot;3-step icon flow&quot; or &quot;phone-to-checkmark&quot;</li>
            <li>• <strong>/for-drivers</strong> near the earnings hero — &quot;wallet money fill&quot; or &quot;cash flow&quot;</li>
            <li>• <strong>/for-partner-stores</strong> near the earnings table — &quot;package scanned&quot; or &quot;box stamp&quot;</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
