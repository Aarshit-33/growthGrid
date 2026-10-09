/* ─────────────────────────────────────────────────────────────
   The Growth Field's shape, shared by the WebGL scene
   (growth-field.tsx) and its painted still for page views
   without a GPU (home/hero-poster.tsx). Plain numbers only:
   this module must never import three.js.
   ───────────────────────────────────────────────────────────── */

/** Column pitch, column width and the front row's z (world units). */
export const FIELD = { spacing: 0.36, cell: 0.25, front: 6.4 } as const;

/** Grid size and resting camera per layout (compact: phones, < 768px). */
export const FIELD_VIEWS = {
  wide: { cols: 66, rows: 48, fov: 34, camY: 3.15, camZ: 9.4 },
  compact: { cols: 34, rows: 40, fov: 50, camY: 3.9, camZ: 10.2 },
} as const;

/** Where the resting camera looks (x follows the camera). */
export const FIELD_LOOK = { y: 0.25, z: -2.6 } as const;
