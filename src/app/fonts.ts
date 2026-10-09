import { Inter, Instrument_Serif, JetBrains_Mono, Space_Grotesk } from "next/font/google";

/** Display — headings and numerals. */
export const fontDisplay = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

/** Body copy. */
export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Emphasis inside headlines (serif italic accent). */
export const fontSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["italic"],
  display: "swap",
});

/** Labels, metadata, terminals. Not preloaded — never part of LCP. */
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

export const fontVariables = [fontDisplay, fontSans, fontSerif, fontMono]
  .map((f) => f.variable)
  .join(" ");
