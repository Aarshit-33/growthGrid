"use client";

import { createContext, use, type ReactNode } from "react";
import type { BrandMarkImage } from "@/lib/brand";

/* The Branding mark for client components below the site chrome (the page
   transition curtain), which can't read settings themselves. */

const BrandMarkContext = createContext<BrandMarkImage | null>(null);

export function BrandMarkProvider({ mark, children }: { mark: BrandMarkImage | null; children: ReactNode }) {
  return <BrandMarkContext value={mark}>{children}</BrandMarkContext>;
}

/** The Branding mark, or null for the built-in grid mark. */
export const useBrandMark = () => use(BrandMarkContext);
