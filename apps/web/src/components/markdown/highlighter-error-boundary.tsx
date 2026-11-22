import { Component, type ReactNode } from "react"

type Props = Readonly<{ fallback: ReactNode; children: ReactNode }>

/** Keeps a failed highlighter chunk download from taking the already-loaded reply down with it. */
export class HighlighterErrorBoundary extends Component<
  Props,
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error("Code highlighter failed to load", error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
