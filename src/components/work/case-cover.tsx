"use client";

import { motion, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import { useRef } from "react";
import type { ImageAsset } from "@/lib/schemas";

/**
 * Near full-bleed case-study cover with a slow scroll-linked settle (a gentle
 * zoom-out and drift). The server and client render the same transform, and
 * reduced-motion users get a static image via a CSS override.
 */
export function CaseCover({ image }: { image: ImageAsset }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1.14, 1]);
  const y = useTransform(scrollYProgress, [0, 1], ["-3%", "3%"]);

  return (
    <div
      ref={ref}
      className="relative aspect-[4/3] overflow-hidden border-y border-line bg-surface sm:aspect-[16/9] sm:rounded-panel sm:border lg:aspect-[21/9]"
    >
      <motion.div className="absolute inset-0 motion-reduce:transform-none!" style={{ scale, y }}>
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="100vw"
          preload
          className="size-full object-cover"
        />
      </motion.div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgb(4_7_10/0.55))]"
      />
      <div aria-hidden="true" className="blueprint pointer-events-none absolute inset-0 opacity-25 [--grid-size:4rem]" />
    </div>
  );
}
