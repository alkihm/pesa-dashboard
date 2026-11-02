import { useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { Segmented } from "@/components/Segmented";
import { categoryColourVar } from "@/lib/categoryColours";
import type { Db } from "@/lib/supabase";
import {
  cleanRule,
  COLOURS,
  EMOJIS,
  emptyForm,
  formFor,
  problem,
  type CategoryRecord,
  type Form,
  type Kind,
} from "./category";
import { saveCategory, setArchived, type CategoryData, type SaveResult } from "./data";
import styles from "./Categories.module.css";

const KINDS = [
  { value: "spending" as const, label: "🛒 Spending" },
  { value: "income" as const, label: "💰 Income" },
];

interface CategoryFormProps {
  data: CategoryData;
  db: () => Db;
  /** Edit this category; without it the form makes a new one. */
  existing?: CategoryRecord;
  kind?: Kind;
  onSaved: (name: string, result: SaveResult) => void;
  onArchived?: (archived: boolean) => void;
}

// New and edit share this form: name, type (new only), emoji, colour, budget (spending only) and payee rules.
export function CategoryForm({
  data,
  db,
  existing,
  kind = "spending",
  onSaved,
  onArchived,
}: CategoryFormProps) {
  const [form, setForm] = useState<Form>(() => (existing ? formFor(existing, data.rules) : emptyForm(kind)));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));

  const addRule = () => {
    const rule = cleanRule(draft, form.rules);
    if (!rule) return setDraft("");
    const elsewhere = data.rules.find((r) => r.pattern === rule && r.category_id !== existing?.id);
    if (elsewhere) {
      const owner = data.categories.find((c) => c.id === elsewhere.category_id);
      return setError(`${rule} already goes to ${owner?.name ?? "another category"}.`);
    }
    setError(undefined);
    set({ rules: [...form.rules, rule] });
    setDraft("");
  };
  const onRuleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addRule();
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const stop = problem(form, data.categories, existing?.id);
    if (stop) return setError(stop);
    setBusy(true);
    setError(undefined);
    try {
      const nextOrder = Math.max(0, ...data.categories.map((c) => c.sort_order)) + 1;
      const result = await saveCategory(db(), form, { existing, rules: data.rules, nextOrder });
      onSaved(form.name.trim(), result);
      if (!existing) {
        setForm(emptyForm(form.kind));
        setDraft("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive(archived: boolean) {
    if (!existing) return;
    setBusy(true);
    try {
      await setArchived(db(), existing, archived);
      onArchived?.(archived);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ruleCount = form.rules.length;
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.preview}>
        <span
          aria-hidden="true"
          className={styles.previewTile}
          style={{
            background: categoryColourVar(form.colour, "tint"),
            borderColor: categoryColourVar(form.colour),
          }}
        >
          {form.emoji}
        </span>
        <div>
          <div className={styles.previewName}>{form.name.trim() || "New category"}</div>
          <div className={styles.muted}>
            {form.kind === "income" ? "Income" : "Spending"} · {ruleCount}{" "}
            {ruleCount === 1 ? "rule" : "rules"}
          </div>
        </div>
      </div>

      <TextField
        label="Name"
        value={form.name}
        placeholder="e.g. Gym"
        onChange={(e) => set({ name: e.target.value })}
      />

      {existing ? (
        <p className={styles.muted}>
          {existing.kind === "income" ? "💰 Income" : "🛒 Spending"} category
          {existing.system ? " · built in" : ""}
        </p>
      ) : (
        <Segmented
          label="Type"
          options={KINDS}
          value={form.kind}
          onChange={(k) => set({ kind: k })}
          variant="surface"
        />
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Emoji</legend>
        <div className={styles.emojiGrid}>
          {EMOJIS.map(([emoji, name]) => (
            <button
              key={emoji}
              type="button"
              aria-label={name}
              aria-pressed={form.emoji === emoji}
              className={styles.emoji}
              style={
                form.emoji === emoji
                  ? {
                      borderColor: categoryColourVar(form.colour),
                      background: categoryColourVar(form.colour, "tint"),
                    }
                  : undefined
              }
              onClick={() => set({ emoji })}
            >
              {emoji}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Colour</legend>
        <div className={styles.colours}>
          {COLOURS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={c.name}
              aria-pressed={form.colour === c.key}
              className={styles.colour}
              style={{ background: categoryColourVar(c.key) }}
              onClick={() => set({ colour: c.key })}
            />
          ))}
        </div>
      </fieldset>

      {form.kind === "spending" && (
        <TextField
          label="Monthly budget · optional"
          inputMode="decimal"
          placeholder="KES 0"
          value={form.budget}
          onChange={(e) => set({ budget: e.target.value })}
        />
      )}

      <div className={styles.rules}>
        <div className={styles.ruleRow}>
          <TextField
            label="⚙️ Auto-assign when payee contains"
            placeholder="e.g. FITNESS"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onRuleKey}
          />
          <Button variant="secondary" onClick={addRule} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        {ruleCount > 0 && (
          <ul className={styles.ruleChips} aria-label="Payee rules">
            {form.rules.map((rule) => (
              <li key={rule} className={styles.ruleChip}>
                {rule}
                <button
                  type="button"
                  aria-label={`Remove rule ${rule}`}
                  onClick={() => set({ rules: form.rules.filter((r) => r !== rule) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <Button type="submit" block disabled={busy}>
        {busy ? "Saving…" : "Save category"}
      </Button>
      {existing && !existing.system && (
        <Button variant="ghost" block disabled={busy} onClick={() => archive(!existing.archived_at)}>
          {existing.archived_at ? "Restore category" : "Archive category"}
        </Button>
      )}
    </form>
  );
}
