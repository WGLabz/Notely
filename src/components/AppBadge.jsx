import React from "react";

export function AppBadge({
  variant = "default",
  children,
  className = "",
  ...rest
}) {
  const variantClass = variant !== "default" ? `badge-${variant}` : "";
  const classes = ["app-badge", variantClass, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}

export default AppBadge;
