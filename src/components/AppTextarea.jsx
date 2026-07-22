import { forwardRef } from "react";

export const AppTextarea = forwardRef(function AppTextarea(
  {
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const classes = ["app-textarea", className].filter(Boolean).join(" ");
  return (
    <textarea ref={ref} className={classes} {...rest}>
      {children}
    </textarea>
  );
});

export default AppTextarea;
