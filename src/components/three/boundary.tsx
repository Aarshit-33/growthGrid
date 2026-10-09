"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a 3D failure (a chunk that didn't load, a scene that threw, a
 * WebGL context the browser refused) from taking the page down with it:
 * it renders nothing and reports, and the caller falls back to the
 * static scenes. React only catches render errors in class components.
 */
export class SceneBoundary extends Component<
  { children: ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
