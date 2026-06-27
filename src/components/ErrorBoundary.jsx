import React from "react";

/**
 * Generic error boundary. Catches render/runtime errors in its subtree and
 * shows a recoverable fallback instead of crashing the whole renderer to a
 * blank screen. Use a `label` to scope the message and an optional `onReset`.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info?.componentStack);
  }

  handleReset() {
    this.setState({ error: null });
    if (typeof this.props.onReset === "function") {
      this.props.onReset();
    }
  }

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <h2 className="error-boundary-title">
              {this.props.label ? `${this.props.label} failed to load` : "Something went wrong"}
            </h2>
            <p className="error-boundary-message">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button type="button" className="error-boundary-retry" onClick={this.handleReset}>
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
