"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

// Lottie's web player touches `window` on init — must lazy-load with
// SSR disabled so Next.js doesn't crash during static generation.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

interface Props {
  /** The imported Lottie JSON (e.g. `import data from "./animation.json"`) */
  animationData: object;
  /** Optional CSS sizing overrides */
  style?: CSSProperties;
  /** Loop continuously (default true) */
  loop?: boolean;
  /** Autoplay on mount (default true) */
  autoplay?: boolean;
  /** Tailwind class string applied to the wrapper */
  className?: string;
}

/**
 * Thin wrapper around lottie-react's player.
 *
 * Drop a Lottie JSON into `src/animations/`, import it, pass it in:
 *
 *   import deliveryFlow from "@/animations/delivery-flow.json";
 *   <LottieAnimation animationData={deliveryFlow} className="w-full max-w-md" />
 *
 * Free animations: lottiefiles.com (filter by free + community).
 * Recolour to brand palette via the JSON's `it` array — or use Lottie's
 * Color Override on the website if it ships with one.
 */
export function LottieAnimation({
  animationData,
  style,
  loop = true,
  autoplay = true,
  className,
}: Props) {
  return (
    <div className={className} style={style}>
      <Lottie
        animationData={animationData}
        loop={loop}
        autoplay={autoplay}
        rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
      />
    </div>
  );
}
