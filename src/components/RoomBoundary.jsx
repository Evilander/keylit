// RoomBoundary.jsx — one wrong note must not stop the show. A render error in
// any room lands here instead of white-screening the whole bench; the other
// rooms stay reachable, and "Reopen the room" retries in place. App keys this
// by `section`, so simply walking to another room resets the boundary.
// (A class, deliberately: error boundaries are the one React feature hooks
// still can't express.)
import { Component } from "react";
import { C, MONO, DISPLAY } from "../ui/theme.js";

export default class RoomBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[keylit] room render failed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="faceplate" role="alert" style={{ margin: "24px auto", maxWidth: 560, padding: 28, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 26, color: C.ink, marginBottom: 8 }}>
          This room hit a wrong note.
        </div>
        <div style={{ color: C.muted, marginBottom: 6 }}>
          The rest of the bench is fine — switch rooms, or try this one again.
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginBottom: 18, wordBreak: "break-word" }}>
          {String(this.state.error?.message || this.state.error)}
        </div>
        <button className="kl-pill" onClick={() => this.setState({ error: null })}>
          Reopen the room
        </button>
      </div>
    );
  }
}
