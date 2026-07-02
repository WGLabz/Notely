import { forwardRef } from "react";

export const AppInput = forwardRef(function AppInput(
  {
    className = "",
    type = "text",
    ...rest
  },
  ref,
) {
  return <input ref={ref} type={type} className={className} {...rest} />;
});

export default AppInput;
