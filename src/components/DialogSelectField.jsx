import AppSelect from "./AppSelect";

export function DialogSelectField({
  label,
  value,
  onChange,
  children,
  id,
  className = "",
}) {
  return (
    <label className={`overlay-dialog-field${className ? ` ${className}` : ""}`} htmlFor={id}>
      <span>{label}</span>
      <AppSelect
        id={id}
        value={value}
        onChange={onChange}
        className="topbar-popover-select app-select"
      >
        {children}
      </AppSelect>
    </label>
  );
}

export default DialogSelectField;
