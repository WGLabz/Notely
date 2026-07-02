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
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="topbar-popover-select"
      >
        {children}
      </select>
    </label>
  );
}

export default DialogSelectField;
