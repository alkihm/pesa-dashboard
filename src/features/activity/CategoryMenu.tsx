// The desktop table's category drop-down ([2.6]): styled like the design instead of the browser's pale native list.
// A button opens a listbox; arrows move, Enter picks, Escape closes. The list is fixed to the viewport so the
// table's scroll box never clips it.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Category } from "@/lib/data/categories";
import styles from "./CategoryMenu.module.css";

interface CategoryMenuProps {
  /** What the button shows now: the row's look ("To review", "Food"…). */
  label: string;
  emoji: string;
  review?: boolean;
  value: string | null;
  categories: Category[];
  onPick: (categoryId: string) => void;
  disabled?: boolean;
}

export function CategoryMenu({
  label,
  emoji,
  review,
  value,
  categories,
  onPick,
  disabled,
}: CategoryMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ top: number; left: number; width: number }>();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  function show() {
    const rect = button.current!.getBoundingClientRect();
    setPlace({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setActive(
      Math.max(
        0,
        categories.findIndex((c) => c.id === value),
      ),
    );
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: Event) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))
        setOpen(false);
    };
    const moved = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function pick(index: number) {
    const choice = categories[index];
    close();
    if (choice && choice.id !== value) onPick(choice.id);
  }

  function onKey(e: KeyboardEvent) {
    const last = categories.length - 1;
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => pick(active),
      " ": () => pick(active),
      Escape: () => close(),
      Tab: () => close(false),
    };
    const move = moves[e.key];
    if (!move) return;
    if (e.key !== "Tab") e.preventDefault();
    move();
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Category: ${label}`}
        disabled={disabled}
        className={review ? `${styles.button} ${styles.review}` : styles.button}
        onClick={() => (open ? close() : show())}
      >
        <span aria-hidden="true">{emoji}</span>
        <span className={styles.label}>{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && place && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label="Categories"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          className={styles.list}
          style={{ top: place.top, left: place.left, minWidth: place.width }}
          onKeyDown={onKey}
        >
          {categories.map((c, i) => (
            <li
              key={c.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={c.id === value}
              className={i === active ? `${styles.option} ${styles.active}` : styles.option}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span aria-hidden="true">{c.emoji ?? "🏷️"}</span> {c.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
