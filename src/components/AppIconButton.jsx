import { forwardRef } from "react";

export const AppIconButton = forwardRef(function AppIconButton(
  {
    className = "",
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  const classes = ["icon-button", className].filter(Boolean).join(" ");

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {children}
    </button>
  );
});

export default AppIconButton;
