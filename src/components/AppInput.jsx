import { forwardRef } from "react";

export const AppInput = forwardRef(function AppInput(
  {
    className = "",
    type = "text",
    ...rest
  },
  ref,
) {
  const classes = ["app-input", className].filter(Boolean).join(" ");
  return <input ref={ref} type={type} className={classes} {...rest} />;
});

export default AppInput;
