import AppButton from "./AppButton";

export function AppChipButton({
  chipClassName,
  active = false,
  className = "",
  children,
  ...rest
}) {
  const mergedClassName = [className, chipClassName, active ? "active" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <AppButton variant="small" className={mergedClassName} {...rest}>
      {children}
    </AppButton>
  );
}

export default AppChipButton;
