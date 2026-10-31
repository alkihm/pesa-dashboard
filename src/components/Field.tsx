import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldFrameProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

function useFieldIds(id?: string) {
  const auto = useId();
  const inputId = id ?? auto;
  return { inputId, hintId: `${inputId}-hint`, errorId: `${inputId}-error` };
}

function Frame({
  label,
  hint,
  error,
  ids,
  children,
}: FieldFrameProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={ids.inputId} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={ids.hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy({ hint, error }: FieldFrameProps, ids: ReturnType<typeof useFieldIds>) {
  if (error) return ids.errorId;
  return hint ? ids.hintId : undefined;
}

type InputProps = FieldFrameProps & Omit<InputHTMLAttributes<HTMLInputElement>, "children">;

export function TextField({ label, hint, error, id, className, ...rest }: InputProps) {
  const ids = useFieldIds(id);
  return (
    <Frame label={label} hint={hint} error={error} ids={ids}>
      <input
        id={ids.inputId}
        type="text"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ label, hint, error }, ids)}
        className={[styles.control, className].filter(Boolean).join(" ")}
        {...rest}
      />
    </Frame>
  );
}

/** Amount entry. A text input with a decimal keypad, so typing is never reformatted under the cursor. */
export function NumberField({ label, hint, error, id, className, ...rest }: Omit<InputProps, "type">) {
  const ids = useFieldIds(id);
  return (
    <Frame label={label} hint={hint} error={error} ids={ids}>
      <input
        id={ids.inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ label, hint, error }, ids)}
        className={[styles.control, styles.number, className].filter(Boolean).join(" ")}
        {...rest}
      />
    </Frame>
  );
}

type SelectProps = FieldFrameProps & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ label, hint, error, id, className, children, ...rest }: SelectProps) {
  const ids = useFieldIds(id);
  return (
    <Frame label={label} hint={hint} error={error} ids={ids}>
      <select
        id={ids.inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ label, hint, error }, ids)}
        className={[styles.control, styles.select, className].filter(Boolean).join(" ")}
        {...rest}
      >
        {children}
      </select>
    </Frame>
  );
}
