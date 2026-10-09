"use client";

import { useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { ChevronDown, EyeOff, Shapes } from "lucide-react";
import { Icon, isIconName } from "@/components/ui/icon";
import type { JsonSchema, RefOption } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { inputClasses, Switch } from "../ui";
import { describedBy, FieldShell, hintFor, LIST_ID, useForm } from "./context";
import { fieldId, hintPath, humanize, isColorSchema, isLongText, parsePathKey, requiredSnippet } from "./schema-utils";

/* ─────────────────────────────────────────────────────────────
   Leaf inputs of the schema forms: text, numbers, switches,
   choices, colours, dates and references to other content.
   ───────────────────────────────────────────────────────────── */

export interface LeafProps {
  value: unknown;
  at: string;
  name: string;
  label: string;
  required: boolean;
  nullable: boolean;
  order?: readonly string[];
}

/** What an emptied field becomes: null (nullable), "" (required: flagged on save) or removed (optional). */
const emptyValue = (required: boolean, nullable: boolean) => (nullable ? null : required ? "" : undefined);

/* ── Textarea that grows with its content ─────────────────── */

export function AutoTextarea({
  value,
  onValue,
  invalid = false,
  mono = false,
  minRows = 3,
  className,
  ...rest
}: Omit<ComponentPropsWithoutRef<"textarea">, "value" | "onChange"> & {
  value: string;
  onValue: (value: string) => void;
  invalid?: boolean;
  mono?: boolean;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(event) => onValue(event.target.value)}
      spellCheck={!mono}
      className={cn(
        inputClasses(invalid),
        "block resize-none overflow-hidden py-2.5 leading-relaxed",
        mono && "font-mono text-[0.8rem] leading-[1.7]",
        className,
      )}
      {...rest}
    />
  );
}

/** "42 / 60", amber near the limit and red over it. */
function Counter({ length, max, ideal }: { length: number; max?: number; ideal?: number }) {
  const limit = max ?? ideal;
  if (!limit) return null;
  const tone = max && length > max ? "text-danger" : length > limit * 0.9 ? "text-warn" : length > 0 ? "text-em/80" : "text-faint";
  return (
    <span className={cn("font-mono text-[0.66rem] tabular-nums", tone)} aria-live="polite">
      {length} / {limit}
    </span>
  );
}

/** Recommended lengths for search snippets. */
const IDEAL_LENGTH: Record<string, number> = { "seo.title": 50, "seo.description": 160 };

/* ── Text ─────────────────────────────────────────────────── */

export function StringField({ schema, ...props }: LeafProps & { schema: JsonSchema }) {
  const { value, at, name, label, required, nullable, order } = props;
  const { set, refs, issues } = useForm();
  const id = fieldId(at);
  const error = issues.get(at);
  const text = typeof value === "string" ? value : "";
  const path = hintPath(parsePathKey(at));
  const snippet = requiredSnippet(schema);
  const hint = hintFor(at, name) ?? (snippet ? `Must include “${snippet}”, which is replaced on the site.` : undefined);
  const describe = describedBy(id, hint, error);
  // Decided once, so a line that grows past the limit doesn't swap inputs (and focus) mid-typing.
  const [long] = useState(() => isLongText(name, value, schema));

  const commit = (next: string) => set(at, next === "" ? emptyValue(required, nullable) : next, order);

  const options = refs[path];
  if (options) {
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
        <RefSelect
          id={id}
          options={options}
          value={text}
          allowNone={nullable || !required}
          invalid={!!error}
          describe={describe}
          onValue={commit}
        />
      </FieldShell>
    );
  }

  const ideal = IDEAL_LENGTH[path];
  const counter = schema.maxLength || ideal ? <Counter length={text.length} max={schema.maxLength} ideal={ideal} /> : null;
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describe,
  } as const;

  if (isColorSchema(schema)) {
    const valid = /^#[0-9a-f]{6}$/i.test(text);
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
        <div className="flex items-center gap-2.5">
          <span
            className="relative size-10 shrink-0 overflow-hidden rounded-xl border border-line-strong shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)] transition-transform duration-200 hover:scale-105"
            style={{ background: valid ? text : "repeating-conic-gradient(#14202a 0 25%, #0a1117 0 50%) 0 0 / 10px 10px" }}
          >
            <input
              type="color"
              value={valid ? text.toLowerCase() : "#3ce49a"}
              onChange={(event) => commit(event.target.value)}
              aria-label={`${label}: pick a colour`}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </span>
          <input
            {...common}
            type="text"
            value={text}
            onChange={(event) => commit(event.target.value)}
            placeholder="#3ce49a"
            spellCheck={false}
            className={inputClasses(!!error, "h-10 font-mono text-[0.84rem]")}
          />
        </div>
      </FieldShell>
    );
  }

  if (schema.format === "date") {
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
        <input
          {...common}
          type="date"
          value={text}
          onChange={(event) => commit(event.target.value)}
          className={inputClasses(!!error, "h-10 font-mono text-[0.84rem] [color-scheme:dark]")}
        />
      </FieldShell>
    );
  }

  if (long) {
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error} wide aside={counter}>
        <AutoTextarea {...common} value={text} onValue={commit} invalid={!!error} mono={name === "code"} />
      </FieldShell>
    );
  }

  const type = schema.format === "email" ? "email" : schema.format === "uri" ? "url" : "text";
  const isLink = name === "href" || path.endsWith(".href");
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} aside={counter}>
      <input
        {...common}
        type={type}
        value={text}
        onChange={(event) => commit(event.target.value)}
        list={isLink ? LIST_ID : undefined}
        placeholder={isLink ? "/work, #faq or https://…" : type === "url" ? "https://…" : undefined}
        spellCheck={type === "text" && !/^(slug|key|id)$/.test(name)}
        autoComplete="off"
        className={inputClasses(!!error, cn("h-10", /^(slug|key|id|src)$/.test(name) && "font-mono text-[0.84rem]"))}
      />
    </FieldShell>
  );
}

/* ── References to other content ──────────────────────────── */

function groupOptions(options: RefOption[]): [string, RefOption[]][] {
  const groups = new Map<string, RefOption[]>();
  for (const option of options) {
    const group = option.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), option]);
  }
  return [...groups.entries()];
}

export function OptionList({ options }: { options: RefOption[] }) {
  return groupOptions(options).map(([group, list]) => {
    const items = list.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
        {option.hidden ? " (hidden)" : ""}
      </option>
    ));
    return group ? (
      <optgroup key={group} label={group}>
        {items}
      </optgroup>
    ) : (
      items
    );
  });
}

export function SelectChevron() {
  return (
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint"
      aria-hidden="true"
    />
  );
}

function RefSelect({
  id,
  options,
  value,
  allowNone,
  invalid,
  describe,
  onValue,
}: {
  id: string;
  options: RefOption[];
  value: string;
  allowNone: boolean;
  invalid: boolean;
  describe?: string;
  onValue: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onValue(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describe}
          className={inputClasses(invalid, "h-10 appearance-none pr-9")}
        >
          {allowNone ? (
            <option value="">None</option>
          ) : (
            !value && (
              <option value="" hidden>
                Choose…
              </option>
            )
          )}
          {value && !selected && <option value={value}>{value} (not found)</option>}
          <OptionList options={options} />
        </select>
        <SelectChevron />
      </div>
      {selected?.hidden && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[0.76rem] text-warn">
          <EyeOff className="size-3.5" aria-hidden="true" /> Hidden on the site, so this link won&apos;t show.
        </p>
      )}
    </>
  );
}

/* ── Numbers ──────────────────────────────────────────────── */

export function NumberField({ schema, integer, ...props }: LeafProps & { schema: JsonSchema; integer: boolean }) {
  const { value, at, name, label, required, nullable, order } = props;
  const { set, issues } = useForm();
  const [draft, setDraft] = useState<string | null>(null);
  const id = fieldId(at);
  const error = issues.get(at);
  const hint = hintFor(at, name);
  const min = schema.minimum ?? (schema.exclusiveMinimum !== undefined && integer ? schema.exclusiveMinimum + 1 : undefined);
  const max = schema.maximum !== undefined && schema.maximum < 1e12 ? schema.maximum : undefined;

  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <input
        id={id}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? 1 : "any"}
        min={min}
        max={max}
        value={draft ?? (typeof value === "number" ? String(value) : "")}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw.trim() === "") return set(at, nullable ? null : undefined, order);
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) set(at, parsed, order);
        }}
        onBlur={() => setDraft(null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={inputClasses(!!error, "h-10 font-mono text-[0.86rem] tabular-nums")}
      />
    </FieldShell>
  );
}

/* ── On / off ─────────────────────────────────────────────── */

export function BooleanField(props: LeafProps) {
  const { value, at, name, label, required, order } = props;
  const { set, issues } = useForm();
  const id = fieldId(at);
  const error = issues.get(at);
  const hint = hintFor(at, name);
  const checked = value === true;

  return (
    <div
      data-field={id}
      className="flex min-h-[4.25rem] items-center justify-between gap-4 rounded-xl border border-line bg-white/[0.015] px-4 py-3 transition-colors hover:border-line-strong"
    >
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[0.84rem] font-medium text-dim">
          {label}
        </label>
        {(error || hint) && (
          <p id={`${id}-hint`} className={cn("mt-0.5 text-[0.76rem] leading-snug", error ? "text-danger" : "text-faint")}>
            {error ?? hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        aria-describedby={error || hint ? `${id}-hint` : undefined}
        // Optional switches are only written when on, keeping the files tidy.
        onCheckedChange={(on) => set(at, on ? true : required ? false : undefined, order)}
      />
    </div>
  );
}

/* ── Choices ──────────────────────────────────────────────── */

type Choice = string | number | boolean;

const choiceLabel = (name: string, choice: Choice) =>
  name === "level" && typeof choice === "number" ? `H${choice}` : humanize(String(choice));

export function EnumField({ options, ...props }: LeafProps & { options: Choice[] }) {
  const { value, at, name, label, required, nullable, order } = props;
  const { set, issues } = useForm();
  const id = fieldId(at);
  const error = issues.get(at);
  const hint = hintFor(at, name);
  const allowNone = nullable || !required;
  const commit = (choice: Choice | undefined) =>
    set(at, choice === undefined ? (nullable ? null : undefined) : choice, order);

  if (options.length > 0 && options.every(isIconName)) {
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
        <IconPicker id={id} options={options as string[]} value={typeof value === "string" ? value : ""} onPick={commit} />
      </FieldShell>
    );
  }

  const segmented = options.length <= 4 && options.every((choice) => choiceLabel(name, choice).length <= 14);
  if (segmented) {
    const choices: (Choice | undefined)[] = allowNone ? [undefined, ...options] : options;
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error} labelAsText>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-white/[0.02] p-1"
        >
          {choices.map((choice, i) => {
            const active = choice === undefined ? value === undefined || value === null : value === choice;
            return (
              <button
                key={i}
                id={i === 0 ? id : undefined}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => commit(choice)}
                className={cn(
                  "h-8 rounded-lg px-3.5 text-[0.8rem] font-medium transition-[background-color,color,box-shadow] duration-200",
                  active
                    ? "bg-em/15 text-hot shadow-[inset_0_0_0_1px_rgb(60_228_154/0.45)]"
                    : "text-muted hover:bg-white/[0.05] hover:text-ink",
                )}
              >
                {choice === undefined ? "None" : choiceLabel(name, choice)}
              </button>
            );
          })}
        </div>
      </FieldShell>
    );
  }

  const index = options.findIndex((choice) => choice === value);
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <div className="relative">
        <select
          id={id}
          value={index === -1 ? "" : String(index)}
          onChange={(event) => commit(event.target.value === "" ? undefined : options[Number(event.target.value)])}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={inputClasses(!!error, "h-10 appearance-none pr-9")}
        >
          {(allowNone || index === -1) && (
            <option value="" hidden={!allowNone}>
              {allowNone ? "None" : "Choose…"}
            </option>
          )}
          {options.map((choice, i) => (
            <option key={String(choice)} value={String(i)}>
              {choiceLabel(name, choice)}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
    </FieldShell>
  );
}

function IconPicker({
  id,
  options,
  value,
  onPick,
}: {
  id: string;
  options: string[];
  value: string;
  onPick: (choice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-icons`}
        onClick={() => setOpen((o) => !o)}
        className={inputClasses(false, "flex h-10 items-center gap-3 pl-1.5 text-left")}
      >
        <span className="grid size-7 place-items-center rounded-lg border border-em/25 bg-em/10 text-em">
          {isIconName(value) ? <Icon name={value} className="size-4" /> : <Shapes className="size-4" aria-hidden="true" />}
        </span>
        <span className="flex-1 truncate font-mono text-[0.8rem] text-dim">{value || "Choose an icon"}</span>
        <ChevronDown
          className={cn("size-4 text-faint transition-transform duration-300", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={`${id}-icons`}
          role="listbox"
          aria-label="Icons"
          className="mt-2 grid animate-rise-in grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-1.5 rounded-xl border border-line bg-surface-2/70 p-2"
        >
          {options.map((choice) => {
            const active = choice === value;
            return (
              <button
                key={choice}
                type="button"
                role="option"
                aria-selected={active}
                title={choice}
                onClick={() => {
                  onPick(choice);
                  setOpen(false);
                }}
                className={cn(
                  "grid aspect-square place-items-center rounded-lg border transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-0.5",
                  active
                    ? "border-em/60 bg-em/12 text-em shadow-[0_0_16px_-4px_rgb(60_228_154/0.7)]"
                    : "border-transparent text-muted hover:border-line-strong hover:bg-white/[0.04] hover:text-ink",
                )}
              >
                {isIconName(choice) && <Icon name={choice} className="size-[1.1rem]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
