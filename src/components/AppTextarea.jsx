import { forwardRef } from "react";

export const AppTextarea = forwardRef(function AppTextarea(
  {
    className = "",
    children,
    ...rest
  },
  ref,
) {
  return (
    <textarea ref={ref} className={className} {...rest}>
      {children}
    </textarea>
  );
});

export default AppTextarea;
