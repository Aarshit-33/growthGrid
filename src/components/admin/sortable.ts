import { useState, type KeyboardEvent, type PointerEvent } from "react";

/* ─────────────────────────────────────────────────────────────
   Drag-to-reorder for lists. Pointer events (mouse, touch, pen)
   on a handle: rows swap live as the pointer crosses their
   middle; the new order is committed on release. The handle also
   takes the keyboard: ↑/↓ moves one place, Home/End to the ends.

   Markup: the list gets `data-sort-list`, each row
   `data-sort-id={id}`, each handle `{...handle(id)}`.
   ───────────────────────────────────────────────────────────── */

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface Drag {
  id: string;
  order: string[];
  origin: string[];
}

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Space kept clear at the screen edges before the page scrolls along. */
const EDGE = 72;

export function useSortable(ids: string[], onCommit: (next: string[], movedId: string) => void, enabled = true) {
  const [drag, setDrag] = useState<Drag | null>(null);

  const finish = (commit: boolean) => {
    if (!drag) return;
    setDrag(null);
    if (commit && !sameOrder(drag.order, drag.origin)) onCommit(drag.order, drag.id);
  };

  const handle = (id: string) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ id, order: ids, origin: ids });
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!drag || drag.id !== id) return;
      const list = event.currentTarget.closest("[data-sort-list]");
      if (!list) return;
      if (event.clientY < EDGE) window.scrollBy(0, -14);
      else if (event.clientY > window.innerHeight - EDGE) window.scrollBy(0, 14);

      // New index: how many other rows the pointer is below the middle of.
      let index = 0;
      for (const row of list.querySelectorAll<HTMLElement>("[data-sort-id]")) {
        if (row.dataset.sortId === id) continue;
        const rect = row.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) index++;
      }
      const rest = drag.order.filter((other) => other !== id);
      const next = [...rest.slice(0, index), id, ...rest.slice(index)];
      if (!sameOrder(next, drag.order)) setDrag({ ...drag, order: next });
    },
    onPointerUp() {
      finish(true);
    },
    onPointerCancel() {
      finish(false);
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (!enabled) return;
      const from = ids.indexOf(id);
      const to =
        event.key === "ArrowUp"
          ? from - 1
          : event.key === "ArrowDown"
            ? from + 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? ids.length - 1
                : null;
      if (to === null) return;
      event.preventDefault();
      if (to < 0 || to >= ids.length || to === from) return;
      onCommit(moveItem(ids, from, to), id);
    },
  });

  return {
    /** Ids in display order (the live order while dragging). */
    order: drag ? drag.order : ids,
    /** Id of the row being dragged. */
    dragging: drag?.id ?? null,
    handle,
  };
}
