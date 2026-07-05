import { forwardRef } from "react";

export const AppButton = forwardRef(function AppButton(
  {
    variant = "small",
    danger = false,
    iconOnly = false,
    className = "",
    type = "button",
    children,
    title,
    ...rest
  },
  ref,
) {
  const baseClass = variant === "primary" ? "primary-button" : "small-button";
  const classes = [
    baseClass,
    danger ? "danger" : "",
    iconOnly ? "icon-only" : "",
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

export default AppButton;
