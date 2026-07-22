import React from "react";

export function AppCard({
  children,
  className = "",
  interactive = false,
  ...rest
}) {
  const classes = [
    "app-card",
    interactive ? "interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function AppCardHeader({ children, className = "", ...rest }) {
  return (
    <div className={`app-card-header ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function AppCardBody({ children, className = "", ...rest }) {
  return (
    <div className={`app-card-body ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function AppCardFooter({ children, className = "", ...rest }) {
  return (
    <div className={`app-card-footer ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export default AppCard;
