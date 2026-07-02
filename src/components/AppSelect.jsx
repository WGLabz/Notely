import { forwardRef } from "react";

export const AppSelect = forwardRef(function AppSelect(
  {
    className = "",
    children,
    ...rest
  },
  ref,
) {
  return (
    <select ref={ref} className={className} {...rest}>
      {children}
    </select>
  );
});

export default AppSelect;
