"use client";

import { useEffect } from "react";
import { QUERIES, useMediaQuery } from "@/hooks/use-media-query";

/** Form fields keep their native menu (paste, spell-check) and text drag-and-drop. */
const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

function inField(target: EventTarget | null): boolean {
  // A text-selection drag starts on a Text node, not an element.
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return el?.closest(FIELD) != null;
}

/** Matches a letter by character or physical key: macOS Option turns "i"
 *  into "ˆ", and non-Latin layouts never report Latin letters. */
function isLetter(e: KeyboardEvent, letter: string): boolean {
  return e.key.toLowerCase() === letter || e.code === `Key${letter.toUpperCase()}`;
}

/** F12, plus the DevTools/console/inspector and view-source chords. */
function isDevToolsShortcut(e: KeyboardEvent): boolean {
  // Chrome's autofill dispatches plain `Event`s named keydown.
  if (!(e instanceof KeyboardEvent)) return false;
  if (e.key === "F12") return true;
  const panel = ["i", "j", "c", "k"].some((l) => isLetter(e, l));
  if (e.metaKey) {
    // macOS: Cmd+Option+I/J/C/K/U, Cmd+Shift+C, Cmd+U.
    if (e.altKey) return panel || isLetter(e, "u");
    return e.shiftKey ? isLetter(e, "c") : isLetter(e, "u");
  }
  // Windows/Linux: Ctrl+Shift+I/J/C/K, Ctrl+U. Never with Alt: Ctrl+Alt is
  // AltGr on Windows, which types characters like ć and €.
  if (!e.ctrlKey || e.altKey || e.getModifierState("AltGraph")) return false;
  return e.shiftKey ? panel : isLetter(e, "u");
}

/**
 * Mouse/trackpad devices only (touch keeps its long-press menus): blocks the
 * right-click menu outside form fields, native drag-and-drop (image and link
 * ghosts, which would also bring the OS cursor back mid-drag) and the
 * DevTools / view-source shortcuts. Cosmetic, not protection: the browser
 * menu still opens DevTools and the page source is public anyway.
 */
export function InteractionGuard() {
  const fine = useMediaQuery(QUERIES.finePointer);

  useEffect(() => {
    if (!fine) return;
    const onContextMenu = (e: MouseEvent) => {
      if (!inField(e.target)) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (!inField(e.target)) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isDevToolsShortcut(e)) e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    // Capture, so nothing on the page can swallow the key first.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [fine]);

  return null;
}
