"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { SceneSlot } from "@/components/three/slot";
import { activeTech, stageStore, techStore, techTooltip, useStore } from "@/components/three/store";
import type { TechSceneData } from "@/components/three/types";
import { TechLogo, techLogo, techLogoColor } from "@/components/ui/tech-logo";
import type { TechnologyCategory } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

/* Rounded so Node and the browser (whose trig can differ in the last bit) emit identical SVG. */
const coord = (v: number) => Math.round(v * 1000) / 1000;

/** Planet j of orbit i in the diagram's viewBox (-100 -80 200 160). */
function planetAt(i: number, j: number, count: number) {
  const rx = 24 + i * 12.5;
  const ry = rx * 0.62;
  const a = (j / count) * Math.PI * 2 + i * 0.93;
  return { rx, ry, x: coord(Math.cos(a) * rx), y: coord(Math.sin(a) * ry) };
}

/**
 * Orbit diagram: shown until the 3D orbit is ready, and for good without
 * WebGL. It mirrors the 3D framing and stays explorable: planets light up
 * with the list, a category press dims the other orbits and, while it is
 * the visible layer (`interactive`), hovering or tapping a planet inspects
 * it, as in 3D. The DOM list stays the accessible control.
 */
function OrbitFallback({
  categories,
  active,
  category,
  interactive,
}: {
  categories: TechnologyCategory[];
  active: string | null;
  category: string | null;
  interactive: boolean;
}) {
  const label = active
    ? categories
        .flatMap((cat, i) =>
          cat.technologies.map((t, j) => ({
            slug: t.slug,
            name: t.name,
            color: cat.color,
            ...planetAt(i, j, cat.technologies.length),
          })),
        )
        .find((p) => p.slug === active)
    : undefined;

  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative aspect-[5/4] w-[92%]">
        <svg viewBox="-100 -80 200 160" className="absolute inset-0 size-full overflow-visible" fill="none">
          <circle r="10" fill="rgb(60 228 154 / 0.18)" />
          <circle r="4" fill="var(--color-em)" />
          {categories.map((cat, i) => {
            const { rx, ry } = planetAt(i, 0, 1);
            const dimmed = category !== null && category !== cat.key;
            return (
              <g key={cat.key} className={cn("transition-opacity duration-500", dimmed && "opacity-25")}>
                <ellipse
                  rx={rx}
                  ry={ry}
                  stroke={cat.color}
                  strokeOpacity={category === cat.key ? 0.75 : 0.3}
                  strokeWidth={0.5}
                />
                {cat.technologies.map((t, j) => {
                  const { x, y } = planetAt(i, j, cat.technologies.length);
                  const on = active === t.slug;
                  return (
                    <g key={t.slug}>
                      {on && (
                        <circle
                          cx={x}
                          cy={y}
                          r={6.5}
                          fill={cat.color}
                          fillOpacity={0.16}
                          stroke={cat.color}
                          strokeOpacity={0.7}
                          strokeWidth={0.45}
                        />
                      )}
                      <circle cx={x} cy={y} r={on ? 3.3 : 2.4} fill={cat.color} />
                      {interactive && (
                        // Generous invisible hit area; events reach it through the
                        // slot's pointer-events:none.
                        <circle
                          cx={x}
                          cy={y}
                          r={6}
                          fill="transparent"
                          className="pointer-events-auto cursor-pointer"
                          onPointerEnter={() => techStore.set({ hovered: t.slug })}
                          onPointerLeave={() => techStore.set((s) => (s.hovered === t.slug ? { hovered: null } : {}))}
                          onClick={() => techStore.set((s) => ({ selected: s.selected === t.slug ? null : t.slug }))}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {interactive && label && (
          <div
            className="pointer-events-none absolute"
            style={{ left: `${(label.x + 100) / 2}%`, top: `${(label.y + 80) / 1.6}%` }}
          >
            <span
              key={label.name}
              className={cn(
                "glass load-fade absolute bottom-4 flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-ink shadow-panel",
                // Keep the chip inside the diagram near its left and right edges.
                label.x < -45 ? "-left-5" : label.x > 45 ? "-right-5" : "left-0 -translate-x-1/2",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: label.color, boxShadow: `0 0 10px ${label.color}` }}
              />
              {label.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Technology explorer. The category lists are the accessible source of
 * truth; the 3D orbit mirrors them. Hovering or focusing a technology
 * highlights its planet, a click pins it, and a planet picked in 3D
 * lights up its entry here. Esc clears the selection.
 */
export function TechnologyExplorer({ categories, hint }: { categories: TechnologyCategory[]; hint: string }) {
  const state = useStore(techStore, (s) => s);
  const ready = useStore(stageStore, (s) => s.technologyReady);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const lookup = useMemo(() => {
    const map = new Map<string, { name: string; description: string; category: TechnologyCategory }>();
    categories.forEach((category) =>
      category.technologies.forEach((t) => map.set(t.slug, { name: t.name, description: t.description, category })),
    );
    return map;
  }, [categories]);

  const data = useMemo<TechSceneData>(
    () => ({
      categories: categories.map((c) => ({
        key: c.key,
        color: c.color,
        technologies: c.technologies.map((t) => ({ slug: t.slug, short: t.short })),
      })),
    }),
    [categories],
  );

  useEffect(() => {
    techTooltip.el = tooltipRef.current;
    return () => {
      techTooltip.el = null;
      techStore.set({ hovered: null, focused: null, selected: null, category: null });
    };
  }, []);

  const active = activeTech(state);
  const current = active ? lookup.get(active) : undefined;
  const category = state.category ? categories.find((c) => c.key === state.category) : undefined;

  const clearFocus = (slug: string) => techStore.set((s) => (s.focused === slug ? { focused: null } : {}));

  return (
    <div
      className="mt-14 grid gap-10 lg:mt-20 lg:grid-cols-12 lg:items-center lg:gap-14"
      onKeyDown={(e) => {
        if (e.key === "Escape") techStore.set({ selected: null, category: null });
      }}
    >
      <div className="relative lg:col-span-7">
        <div className="relative mx-auto aspect-square w-full max-w-[44rem] sm:aspect-[5/4]">
          <SceneSlot
            scene={{ id: "technology", data }}
            fallback={
              <OrbitFallback categories={categories} active={active} category={state.category} interactive={!ready} />
            }
          />
          {/* Positioned over the focused planet by the 3D scene each frame. */}
          <div
            ref={tooltipRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform"
          >
            <div
              className={cn(
                "-translate-x-1/2 -translate-y-[calc(100%+1.7rem)] transition-opacity duration-300",
                ready && current ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="glass flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-ink shadow-panel">
                <span
                  className="size-2 rounded-full"
                  style={{ background: current?.category.color, boxShadow: `0 0 10px ${current?.category.color}` }}
                />
                {current?.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-5">
        <div aria-live="polite" className="card card-hover edge-glow min-h-[13rem] overflow-hidden p-6 sm:p-7">
          {current ? (
            <div key={active} className="load-fade">
              <p className="flex items-center gap-2 label-mono" style={{ color: current.category.color }}>
                <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: current.category.color }} />
                {current.category.name}
              </p>
              <p className="text-h3 mt-3 flex items-center gap-3 text-ink">
                {active && techLogo(active) && (
                  <TechLogo
                    slug={active}
                    className="size-7 shrink-0"
                    style={{ color: techLogoColor(active, current.category.color) }}
                  />
                )}
                {current.name}
              </p>
              <p className="mt-2 min-h-[3lh] text-dim">{current.description}</p>
            </div>
          ) : category ? (
            <div key={category.key} className="load-fade">
              <p className="flex items-center gap-2 label-mono" style={{ color: category.color }}>
                <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: category.color }} />
                {pad(category.technologies.length)}
              </p>
              <p className="text-h3 mt-3 text-ink">{category.name}</p>
              <p className="mt-2 min-h-[3lh] text-dim">{category.description}</p>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-between gap-6">
              <span aria-hidden="true" className="flex gap-1.5">
                {categories.map((c) => (
                  <span key={c.key} className="size-2 rounded-full" style={{ background: c.color }} />
                ))}
              </span>
              <p className="text-dim">{hint}</p>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-7 xs:grid-cols-2">
          {categories.map((cat) => {
            const pressed = state.category === cat.key;
            return (
              <div key={cat.key} style={{ "--cat": cat.color } as CSSProperties}>
                <h3>
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => techStore.set((s) => ({ category: s.category === cat.key ? null : cat.key }))}
                    className={cn(
                      "group inline-flex items-center gap-2.5 rounded-full py-1 label-mono transition-colors",
                      pressed ? "text-ink" : "hover:text-ink",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 rounded-full bg-[var(--cat)] transition-shadow duration-500",
                        pressed && "shadow-[0_0_0_4px_rgb(255_255_255/0.06),0_0_14px_var(--cat)]",
                      )}
                    />
                    {cat.name}
                    <span className="text-faint">{pad(cat.technologies.length)}</span>
                  </button>
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {cat.technologies.map((t) => {
                    const isActive = active === t.slug;
                    const color = techLogoColor(t.slug, cat.color);
                    return (
                      <li key={t.slug}>
                        <button
                          type="button"
                          aria-label={t.name}
                          title={t.name}
                          aria-pressed={state.selected === t.slug}
                          onPointerEnter={() => techStore.set({ focused: t.slug })}
                          onPointerLeave={() => clearFocus(t.slug)}
                          onFocus={() => techStore.set({ focused: t.slug })}
                          onBlur={() => clearFocus(t.slug)}
                          onClick={() => techStore.set((s) => ({ selected: s.selected === t.slug ? null : t.slug }))}
                          style={{ "--logo": color } as CSSProperties}
                          className={cn(
                            "group/logo grid size-11 place-items-center rounded-xl border transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5",
                            isActive
                              ? "border-[var(--logo)] bg-white/[0.07] shadow-[0_0_18px_-4px_var(--logo)]"
                              : "border-line bg-white/[0.02] hover:border-line-strong hover:bg-white/[0.05]",
                          )}
                        >
                          {techLogo(t.slug) ? (
                            <TechLogo
                              slug={t.slug}
                              className={cn(
                                "size-5 text-[var(--logo)] transition-[opacity,filter] duration-300",
                                isActive ? "opacity-100" : "opacity-80 saturate-[0.85] group-hover/logo:opacity-100 group-hover/logo:saturate-100",
                              )}
                            />
                          ) : (
                            <span aria-hidden="true" className="text-xs font-medium text-dim">
                              {t.short}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
