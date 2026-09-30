"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export function AdminSelect<Value extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: Value; options: ReadonlyArray<{ value: Value; label: string; description?: string; hideValue?: boolean }>;
  onChange: (value: Value) => void; disabled?: boolean;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // A pending request can disable the control while its popup is open.
  if (open && disabled) setOpen(false);
  const [highlight, setHighlight] = useState(0);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function show() { setHighlight(selected); setOpen(true); }
  function choose(index: number) {
    if (disabled || trigger.current?.matches(":disabled")) return;
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false); trigger.current?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Enter", " "].includes(event.key)) event.preventDefault();
    if (event.key === "Escape") setOpen(false);
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!open) show();
      else setHighlight((current) => (current + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (event.key === "Home" && open) setHighlight(0);
    else if (event.key === "End" && open) setHighlight(options.length - 1);
    else if (event.key === "Enter" || event.key === " ") { if (open) choose(highlight); else show(); }
  }
  return <div ref={container} className={`admin-custom-select-field${open ? " is-open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="admin-field-label">{label}</span>
    <button ref={trigger} className="admin-select-trigger" type="button" role="combobox" aria-label={label} aria-controls={id} aria-expanded={open} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-${highlight}` : undefined} disabled={disabled} onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown}>
      <span className="admin-select-value"><strong>{options[selected]?.label}</strong>{options[selected]?.hideValue ? null : <> <span>({value})</span></>}</span>
      <svg className="admin-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
    </button>
    {open ? <div id={id} className="admin-select-menu" role="listbox" aria-label={label}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} className="admin-select-option" role="option" aria-label={option.hideValue ? option.label : `${option.label} (${option.value})`} aria-selected={value === option.value} data-highlighted={highlight === index ? "true" : undefined} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => choose(index)}>
        <span className="admin-select-option-title">{option.label}{option.hideValue ? null : <> <em>({option.value})</em></>}</span>
        {option.description ? <span className="admin-select-option-description">{option.description}</span> : null}
      </div>)}
    </div> : null}
  </div>;
}
