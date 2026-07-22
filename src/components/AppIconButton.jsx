import { forwardRef } from "react";

export const AppIconButton = forwardRef(function AppIconButton(
  {
    size = "md",
    active = false,
    className = "",
    type = "button",
    children,
    title,
    ...rest
  },
  ref,
) {
  const sizeClass = size === "sm" ? "size-sm" : size === "lg" ? "size-lg" : "";
  const classes = [
    "icon-button",
    sizeClass,
    active ? "active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} className={classes} data-tooltip={title} {...rest}>
      {children}
    </button>
  );
});

export default AppIconButton;
