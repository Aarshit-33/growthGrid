"use client";

import { memo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  EyeOff,
  FolderOpen,
  ImageIcon,
  Images,
  Plus,
  Ruler,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { JsonSchema, RefOption } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { toast } from "../toast";
import { Badge, Btn, IconBtn, inputClasses } from "../ui";
import { describedBy, FieldShell, hintFor, useForm } from "./context";
import { ImagePicker, type PickedImage } from "./image-picker";
import { AutoTextarea, BooleanField, EnumField, NumberField, OptionList, SelectChevron, StringField } from "./inputs";
import {
  analyze,
  blankSolid,
  blankValue,
  childKey,
  fieldId,
  hasIssueWithin,
  hintPath,
  humanize,
  isImageSchema,
  isRecord,
  keysOf,
  parsePathKey,
  summarize,
  variantOf,
  type Raw,
  type Shape,
} from "./schema-utils";

/* ─────────────────────────────────────────────────────────────
   The recursive part of the schema forms: objects, lists of
   text or cards, block unions, images and references.
   ───────────────────────────────────────────────────────────── */

export interface FieldProps {
  schema: JsonSchema;
  value: unknown;
  /** Path key of the value ("hero.primaryCta.label"). */
  at: string;
  /** Property name (drives labels, hints and input choice). */
  name: string;
  required: boolean;
  /** Parent's keys in schema order, so new keys land in the right place. */
  order?: readonly string[];
  label?: string;
  /** Body of a panel or card that already shows the label. */
  bare?: boolean;
}

/** One field, picked from the schema. Memoised: editing one field re-renders only its branch. */
export const Field = memo(function Field(props: FieldProps) {
  const shape = analyze(props.schema);
  const label = props.label ?? humanize(props.name);
  const leaf = { value: props.value, at: props.at, name: props.name, label, required: props.required, order: props.order };

  switch (shape.kind) {
    case "string":
      return <StringField {...leaf} schema={shape.schema} nullable={shape.nullable} />;
    case "number":
      return <NumberField {...leaf} schema={shape.schema} integer={shape.integer} nullable={shape.nullable} />;
    case "boolean":
      return <BooleanField {...leaf} nullable={shape.nullable} />;
    case "enum":
      return <EnumField {...leaf} options={shape.options} nullable={shape.nullable} />;
    case "const":
      return null;
    case "object":
      return <ObjectField {...props} label={label} shape={shape} />;
    case "array":
      return <ArrayField {...props} label={label} shape={shape} />;
    case "union":
      return <UnionField {...props} label={label} shape={shape} />;
    default:
      return <JsonField {...props} label={label} />;
  }
});

/* ── Shared bits ──────────────────────────────────────────── */

/** "Industries" → "industry", for "Add …" buttons. */
function singular(label: string): string {
  const words = label.split(" ");
  const last = words.pop() ?? "";
  const one = /ies$/i.test(last)
    ? last.replace(/ies$/i, "y")
    : /(ss|us)$/i.test(last)
      ? last
      : /(ches|shes|sses|xes)$/i.test(last)
        ? last.replace(/es$/i, "")
        : last.replace(/s$/i, "");
  return [...words, one].join(" ").toLowerCase();
}

function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group/add mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[0.82rem] font-medium text-muted transition-[border-color,background-color,color] duration-300 hover:border-em/50 hover:bg-em/[0.05] hover:text-hot disabled:pointer-events-none disabled:opacity-40"
    >
      <Plus className="size-4 transition-transform duration-300 group-hover/add:rotate-90" aria-hidden="true" />
      {children}
    </button>
  );
}

const newKey = () => `n${Math.random().toString(36).slice(2, 10)}`;

function resizeKeys(keys: string[], length: number): string[] {
  if (keys.length >= length) return keys.slice(0, length);
  return [...keys, ...Array.from({ length: length - keys.length }, (_, i) => `r${keys.length + i}`)];
}

/**
 * Stable React keys for list rows (values have no ids), so open cards and
 * focus survive reordering. Lists changed from outside fall back to indexes.
 */
function useListKeys(length: number) {
  const [keys, setKeys] = useState<string[]>(() => Array.from({ length }, (_, i) => `i${i}`));
  const shown = keys.length === length ? keys : resizeKeys(keys, length);
  const update = (change: (keys: string[]) => string[]) =>
    setKeys((current) => change(current.length === length ? current : resizeKeys(current, length)));
  return {
    keys: shown,
    insert: (index: number, key = newKey()) => update((k) => [...k.slice(0, index), key, ...k.slice(index)]),
    remove: (index: number) => update((k) => k.filter((_, i) => i !== index)),
    move: (from: number, to: number) =>
      update((k) => {
        const next = [...k];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      }),
  };
}

const moved = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** Focus a field once it has rendered. */
const focusSoon = (id: string) =>
  requestAnimationFrame(() => (document.getElementById(id) as HTMLElement | null)?.focus());

const pad = (n: number) => String(n).padStart(2, "0");

/* ── Objects ──────────────────────────────────────────────── */

/** The fields of an object in a two-column grid. */
function ObjectBody({ schema, value, at }: { schema: JsonSchema; value: unknown; at: string }) {
  const order = keysOf(schema);
  const required = schema.required ?? [];
  const obj = isRecord(value) ? value : {};
  if (isImageSchema(schema)) return <ImageBody schema={schema} value={obj} at={at} />;
  return (
    <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
      {order.map((key) => (
        <Field
          key={key}
          schema={(schema.properties as Record<string, JsonSchema>)[key]}
          value={obj[key]}
          at={childKey(at, key)}
          name={key}
          required={required.includes(key)}
          order={order}
        />
      ))}
    </div>
  );
}

function ObjectField({
  shape,
  value,
  at,
  name,
  label,
  required,
  order,
  bare,
}: FieldProps & { label: string; shape: Extract<Shape, { kind: "object" }> }) {
  const { set, issues } = useForm();
  const id = fieldId(at);
  const optional = shape.nullable || !required;
  const present = isRecord(value);
  const hint = hintFor(at, name);
  const remove = () => set(at, shape.nullable ? null : undefined, order);

  if (!present && optional) {
    return (
      <div className={cn(!bare && "sm:col-span-2")} data-field={id}>
        {!bare && <p className="mb-2 text-[0.8rem] font-medium text-dim">{label}</p>}
        <AddButton onClick={() => set(at, blankSolid(shape.schema), order)}>Add {label.toLowerCase()}</AddButton>
        {hint && <p className="mt-1.5 text-[0.76rem] leading-relaxed text-faint">{hint}</p>}
      </div>
    );
  }

  const removeBtn = optional && (
    <Btn size="sm" variant="ghost" icon={X} onClick={remove}>
      Remove
    </Btn>
  );

  if (bare) {
    return (
      <div className="space-y-4">
        {removeBtn && <div className="-mt-1 flex justify-end">{removeBtn}</div>}
        <ObjectBody schema={shape.schema} value={value} at={at} />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      data-field={id}
      className={cn(
        "rounded-2xl border bg-white/[0.012] p-4 sm:col-span-2 sm:p-5",
        hasIssueWithin(issues, at) ? "border-danger/40" : "border-line",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`${id}-label`} className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-em/90">
            {label}
          </p>
          {hint && <p className="mt-1 text-[0.76rem] leading-relaxed text-faint">{hint}</p>}
        </div>
        {removeBtn}
      </div>
      {issues.get(at) && <p className="mb-3 text-[0.78rem] text-danger">{issues.get(at)}</p>}
      <ObjectBody schema={shape.schema} value={value} at={at} />
    </div>
  );
}

/* ── Images ───────────────────────────────────────────────── */

function ImagePreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="grid size-full place-items-center text-faint">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <ImageIcon className="size-6" aria-hidden="true" />
          <span className="text-[0.7rem]">{src ? "Not found" : "No image yet"}</span>
        </div>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- admin preview of arbitrary paths
  return <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />;
}

/** next/image only loads files from /public here (no remote hosts are set up), so paths must start with "/". */
function pathProblem(src: string): string | null {
  if (!src || (src.startsWith("/") && !src.startsWith("//"))) return null;
  return /^([a-z][a-z\d+.-]*:|\/\/)/i.test(src)
    ? "Images from other websites aren't enabled on this site. Put the file in /public and pick it with Browse."
    : "Paths start with “/”, e.g. /images/work/cover.jpg (a file in /public).";
}

/** The image's path: typed, or picked from /public with Browse. */
function ImageSrcField({
  value,
  at,
  required,
  order,
  onBrowse,
}: {
  value: unknown;
  at: string;
  required: boolean;
  order: readonly string[];
  onBrowse: () => void;
}) {
  const { set, issues } = useForm();
  const id = fieldId(at);
  const error = issues.get(at);
  const text = typeof value === "string" ? value : "";
  const hint = hintFor(at, "src");
  const problem = pathProblem(text.trim());

  return (
    <FieldShell id={id} label="Image file" required={required} hint={hint} error={error} wide>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={text}
          onChange={(event) => set(at, event.target.value === "" ? (required ? "" : undefined) : event.target.value, order)}
          placeholder="/images/work/cover.jpg"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={[describedBy(id, hint, error), problem ? `${id}-problem` : null].filter(Boolean).join(" ") || undefined}
          className={inputClasses(!!error, "h-10 min-w-0 flex-1 font-mono text-[0.84rem]")}
        />
        <Btn icon={FolderOpen} onClick={onBrowse} className="h-10 shrink-0" aria-haspopup="dialog">
          Browse
        </Btn>
      </div>
      {problem && (
        <p id={`${id}-problem`} className="mt-1.5 flex items-start gap-1.5 text-[0.76rem] leading-snug text-warn">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {problem}
        </p>
      )}
    </FieldShell>
  );
}

function ImageBody({ schema, value, at }: { schema: JsonSchema; value: Raw; at: string }) {
  const { set } = useForm();
  const [picking, setPicking] = useState(false);
  const order = keysOf(schema);
  const required = schema.required ?? [];
  const props = schema.properties as Record<string, JsonSchema>;
  const src = typeof value.src === "string" ? value.src : "";
  const sized = "width" in props && "height" in props;

  const detect = () => {
    const img = new window.Image();
    img.onload = () => {
      set(childKey(at, "width"), img.naturalWidth, order);
      set(childKey(at, "height"), img.naturalHeight, order);
      toast.success("Size detected", { body: `${img.naturalWidth} × ${img.naturalHeight}px` });
    };
    img.onerror = () => toast.error("Couldn't load that image", { body: "Check the path. Files live in /public." });
    img.src = src;
  };

  const pick = ({ src: next, width, height }: PickedImage) => {
    setPicking(false);
    set(childKey(at, "src"), next, order);
    if (sized && width && height) {
      set(childKey(at, "width"), width, order);
      set(childKey(at, "height"), height, order);
      toast.success("Image selected", { body: `${next} · ${width} × ${height}px` });
    } else if (sized) {
      toast.warn("Image selected", { body: "Couldn't read its size: fill in the width and height." });
    } else {
      toast.success("Image selected", { body: next });
    }
    // Next stop: describing it (where a description is required).
    if (required.includes("alt") && (typeof value.alt !== "string" || value.alt.trim() === "")) focusSoon(fieldId(childKey(at, "alt")));
  };

  return (
    <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
      <button
        type="button"
        onClick={() => setPicking(true)}
        aria-label={src ? "Change image" : "Choose an image"}
        aria-haspopup="dialog"
        className="group/preview relative aspect-[4/3] self-start overflow-hidden rounded-xl border border-line bg-surface-2 dot-matrix [--grid-size:0.9rem] transition-[border-color,box-shadow] duration-300 hover:border-em/45 hover:shadow-[0_0_0_4px_rgb(60_228_154/0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-em"
      >
        <ImagePreview key={src} src={src} />
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center bg-bg/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100"
        >
          <span className="inline-flex translate-y-1 items-center gap-1.5 rounded-full border border-em/40 bg-surface/90 px-3 py-1.5 text-[0.76rem] font-medium text-hot shadow-[0_8px_24px_-10px_rgb(60_228_154/0.6)] transition-transform duration-300 ease-out-expo group-hover/preview:translate-y-0 group-focus-visible/preview:translate-y-0">
            <Images className="size-3.5" />
            {src ? "Change image" : "Choose image"}
          </span>
        </span>
      </button>
      <div className="grid content-start gap-x-4 gap-y-4 sm:grid-cols-2">
        {order.map((key) =>
          key === "src" ? (
            <ImageSrcField
              key={key}
              value={value[key]}
              at={childKey(at, key)}
              required={required.includes(key)}
              order={order}
              onBrowse={() => setPicking(true)}
            />
          ) : (
            // Alt text gets the full row, so width and height pair up below it.
            <div key={key} className={cn(key === "alt" && "sm:col-span-2")}>
              <Field
                schema={props[key]}
                value={value[key]}
                at={childKey(at, key)}
                name={key}
                required={required.includes(key)}
                order={order}
              />
            </div>
          ),
        )}
        {sized && (
          <div className="sm:col-span-2">
            <Btn size="sm" icon={Ruler} onClick={detect} disabled={!src}>
              Detect size from file
            </Btn>
          </div>
        )}
      </div>
      {picking && <ImagePicker value={src} onPick={pick} onClose={() => setPicking(false)} />}
    </div>
  );
}

/* ── Unions (content blocks, showcase types) ──────────────── */

function variantLabel(variant: JsonSchema, discriminator: string): string {
  return humanize(String(variant.properties?.[discriminator]?.const ?? "item"));
}

function UnionField({
  shape,
  value,
  at,
  label,
  required,
  order,
  bare,
}: FieldProps & { label: string; shape: Extract<Shape, { kind: "union" }> }) {
  const { set } = useForm();
  const id = fieldId(at);
  const optional = shape.nullable || !required;
  const variant = variantOf(shape, value);
  const d = shape.discriminator;

  if ((value === null || value === undefined) && optional) {
    return (
      <div className={cn(!bare && "sm:col-span-2")} data-field={id}>
        {!bare && <p className="mb-2 text-[0.8rem] font-medium text-dim">{label}</p>}
        <AddButton onClick={() => set(at, blankValue(shape.variants[0]), order)}>Add {label.toLowerCase()}</AddButton>
      </div>
    );
  }

  const switchTo = (target: JsonSchema) => {
    const next = blankValue(target) as Raw;
    // Keep what still fits (e.g. a paragraph's text when it becomes a quote).
    if (isRecord(value)) {
      for (const key of keysOf(target)) {
        if (key !== d && value[key] !== undefined && typeof value[key] === typeof next[key]) next[key] = value[key];
      }
    }
    set(at, next, order);
  };

  return (
    <div className={cn("space-y-5", !bare && "sm:col-span-2")} data-field={id}>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${id}-type`} className="label-mono mr-1">
          Type
        </span>
        <div role="radiogroup" aria-labelledby={`${id}-type`} className="flex flex-wrap gap-1.5">
          {shape.variants.map((v) => {
            const active = v === variant;
            return (
              <button
                key={String(v.properties?.[d]?.const)}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => !active && switchTo(v)}
                className={cn(
                  "h-7 rounded-full border px-3 text-[0.76rem] font-medium transition-[background-color,border-color,color] duration-200",
                  active
                    ? "border-em/50 bg-em/12 text-hot"
                    : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {variantLabel(v, d)}
              </button>
            );
          })}
        </div>
        {optional && (
          <Btn size="sm" variant="ghost" icon={X} className="ml-auto" onClick={() => set(at, shape.nullable ? null : undefined, order)}>
            Remove
          </Btn>
        )}
      </div>
      {variant ? (
        <ObjectBody schema={variant} value={value} at={at} />
      ) : (
        <p className="text-[0.8rem] text-warn">Unknown type. Pick one above to start over.</p>
      )}
    </div>
  );
}

/* ── Lists ────────────────────────────────────────────────── */

function ArrayField(props: FieldProps & { label: string; shape: Extract<Shape, { kind: "array" }> }) {
  const { refs } = useForm();
  const schema = props.shape.schema;
  const items = Array.isArray(props.value) ? props.value : [];
  if (schema.prefixItems) return <TupleField {...props} items={items} tuple={schema.prefixItems} />;

  const itemSchema = schema.items ?? {};
  const itemShape = analyze(itemSchema);
  const options = refs[hintPath(parsePathKey(props.at))];
  if (options && itemShape.kind === "string") return <RefMulti {...props} items={items} options={options} />;
  if (itemShape.kind === "enum") {
    const choices = itemShape.options.map((o) => ({ value: String(o), label: humanize(String(o)) }));
    return <RefMulti {...props} items={items} options={choices} />;
  }
  if (itemShape.kind === "string" || itemShape.kind === "number") {
    return <PrimitiveList {...props} items={items} itemSchema={itemSchema} numeric={itemShape.kind === "number"} />;
  }
  return <ItemList {...props} items={items} itemSchema={itemSchema} />;
}

type ListProps = FieldProps & { label: string; shape: Extract<Shape, { kind: "array" }>; items: unknown[] };

/** Saving an emptied optional list removes it. */
const listValue = (next: unknown[], required: boolean) => (next.length === 0 && !required ? undefined : next);

function TupleField({ items, tuple, at, name, label, required, order }: ListProps & { tuple: JsonSchema[] }) {
  const { issues } = useForm();
  const id = fieldId(at);
  return (
    <FieldShell id={id} label={label} required={required} hint={hintFor(at, name)} error={issues.get(at)} wide labelAsText>
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-labelledby={`${id}-label`}>
        {tuple.map((schema, i) => (
          <Field
            key={i}
            schema={schema}
            value={items[i]}
            at={childKey(at, i)}
            name={name}
            label={`${singular(label).replace(/^./, (c) => c.toUpperCase())} ${i + 1}`}
            required
            order={order}
          />
        ))}
      </div>
    </FieldShell>
  );
}

const LONG_ITEMS = new Set(["paragraphs", "description", "challenge", "solution", "approach", "items", "answer"]);

function PrimitiveList({ items, numeric, shape, at, name, label, required, order }: ListProps & { itemSchema: JsonSchema; numeric: boolean }) {
  const { set, issues } = useForm();
  const { keys, insert, remove, move } = useListKeys(items.length);
  const id = fieldId(at);
  const min = shape.schema.minItems ?? 0;
  const max = shape.schema.maxItems ?? Infinity;
  const [multiline] = useState(
    () => !numeric && (LONG_ITEMS.has(name) || items.some((v) => typeof v === "string" && (v.length > 70 || v.includes("\n")))),
  );
  const write = (next: unknown[]) => set(at, listValue(next, required), order);
  const blank = numeric ? 0 : "";

  const add = (index: number) => {
    insert(index);
    write([...items.slice(0, index), blank, ...items.slice(index)]);
    focusSoon(fieldId(childKey(at, index)));
  };
  const drop = (index: number) => {
    remove(index);
    write(items.filter((_, i) => i !== index));
  };
  const shift = (from: number, to: number) => {
    move(from, to);
    write(moved(items, from, to));
  };
  const change = (index: number, raw: string) => {
    const next = numeric ? (raw.trim() === "" ? undefined : Number(raw)) : raw;
    set(childKey(at, index), next ?? 0);
  };

  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hintFor(at, name) ?? hintFor(childKey(at, 0), name)}
      error={issues.get(at)}
      wide
      labelAsText
      aside={<span className="font-mono text-[0.66rem] text-faint">{items.length}</span>}
    >
      {items.length > 0 && (
        <ol className="space-y-2" aria-labelledby={`${id}-label`}>
          {items.map((item, i) => {
            const itemId = fieldId(childKey(at, i));
            const error = issues.get(childKey(at, i));
            const text = item === undefined || item === null ? "" : String(item);
            return (
              <li key={keys[i]} className="group/row">
                <div className="flex items-start gap-2">
                  <span className="mt-[0.7rem] w-5 shrink-0 text-right font-mono text-[0.64rem] text-faint">{pad(i + 1)}</span>
                  {multiline ? (
                    <AutoTextarea
                      id={itemId}
                      value={text}
                      onValue={(v) => change(i, v)}
                      invalid={!!error}
                      minRows={2}
                      aria-label={`${label} ${i + 1}`}
                      aria-describedby={describedBy(itemId, null, error)}
                    />
                  ) : (
                    <input
                      id={itemId}
                      type={numeric ? "number" : "text"}
                      step="any"
                      value={text}
                      onChange={(event) => change(i, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing && items.length < max) {
                          event.preventDefault();
                          add(i + 1);
                        } else if (event.key === "Backspace" && text === "" && items.length > min) {
                          event.preventDefault();
                          drop(i);
                          if (i > 0) focusSoon(fieldId(childKey(at, i - 1)));
                        }
                      }}
                      aria-label={`${label} ${i + 1}`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy(itemId, null, error)}
                      className={inputClasses(!!error, "h-10")}
                    />
                  )}
                  <div className="mt-1 flex shrink-0 items-center transition-opacity duration-200 sm:opacity-40 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                    <IconBtn icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => shift(i, i - 1)} />
                    <IconBtn icon={ArrowDown} label="Move down" disabled={i === items.length - 1} onClick={() => shift(i, i + 1)} />
                    <IconBtn icon={X} label="Remove" tone="danger" disabled={items.length <= min} onClick={() => drop(i)} />
                  </div>
                </div>
                {error && (
                  <p id={`${itemId}-error`} className="ml-7 mt-1 text-[0.76rem] text-danger">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <AddButton onClick={() => add(items.length)} disabled={items.length >= max}>
        Add {singular(label)}
        {!multiline && items.length > 0 && <span className="hidden font-mono text-[0.64rem] text-faint sm:inline">or press Enter</span>}
      </AddButton>
    </FieldShell>
  );
}

/** Choose items from other content (or a fixed set): toggle chips, or a picker for long lists. */
function RefMulti({ items, options, at, name, label, required, order }: ListProps & { options: RefOption[] }) {
  const { set, issues } = useForm();
  const id = fieldId(at);
  const selected = items.filter((v): v is string => typeof v === "string");
  const byValue = new Map(options.map((o) => [o.value, o]));
  const write = (next: string[]) => set(at, listValue(next, required), order);
  const toggle = (v: string) => write(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const error = issues.get(at) ?? selected.map((_, i) => issues.get(childKey(at, i))).find(Boolean);
  const hint = hintFor(at, name);

  const chip = (option: RefOption, active: boolean, onClick: () => void, removable = false) => (
    <button
      key={option.value}
      type="button"
      role={removable ? undefined : "checkbox"}
      aria-checked={removable ? undefined : active}
      aria-label={removable ? `Remove ${option.label}` : undefined}
      onClick={onClick}
      title={option.hidden ? "Hidden on the site" : option.group}
      className={cn(
        "group/chip inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.78rem] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95",
        active
          ? "border-em/45 bg-em/10 text-ink hover:border-em/70"
          : "border-line text-muted hover:border-line-strong hover:bg-white/[0.03] hover:text-ink",
        option.hidden && "italic",
      )}
    >
      {active && !removable && <Check className="size-3.5 text-em" aria-hidden="true" />}
      {option.hidden && <EyeOff className="size-3 text-warn" aria-hidden="true" />}
      {option.label}
      {removable && <X className="size-3.5 text-faint transition-colors group-hover/chip:text-danger" aria-hidden="true" />}
    </button>
  );

  if (options.length <= 12) {
    return (
      <FieldShell id={id} label={label} required={required} hint={hint} error={error} wide labelAsText>
        <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {options.map((option) => chip(option, selected.includes(option.value), () => toggle(option.value)))}
          {selected
            .filter((v) => !byValue.has(v))
            .map((v) => chip({ value: v, label: `${v} (not found)` }, true, () => toggle(v), true))}
        </div>
      </FieldShell>
    );
  }

  const remaining = options.filter((o) => !selected.includes(o.value));
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
      wide
      aside={<span className="font-mono text-[0.66rem] text-faint">{selected.length} selected</span>}
    >
      {selected.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((v) => chip(byValue.get(v) ?? { value: v, label: `${v} (not found)` }, true, () => toggle(v), true))}
        </div>
      )}
      <div className="relative">
        <select
          id={id}
          value=""
          onChange={(event) => event.target.value && write([...selected, event.target.value])}
          disabled={remaining.length === 0}
          aria-describedby={describedBy(id, hint, error)}
          className={inputClasses(false, "h-10 appearance-none pr-9 text-muted")}
        >
          {/* A prompt, not a choice: shown in the closed control, left out of the open list. */}
          <option value="" hidden>
            {remaining.length ? `Add ${singular(label)}…` : "All added"}
          </option>
          <OptionList options={remaining} />
        </select>
        <SelectChevron />
      </div>
    </FieldShell>
  );
}

/** A list of cards (objects or blocks), each collapsible. */
function ItemList({ items, itemSchema, shape, at, name, label, required, order, bare }: ListProps & { itemSchema: JsonSchema }) {
  const { set, issues } = useForm();
  const { keys, insert, remove, move } = useListKeys(items.length);
  const [fresh, setFresh] = useState<string[]>([]);
  const id = fieldId(at);
  const itemShape = analyze(itemSchema);
  const min = shape.schema.minItems ?? 0;
  const max = shape.schema.maxItems ?? Infinity;
  const write = (next: unknown[]) => set(at, listValue(next, required), order);
  const hint = hintFor(at, name);

  const add = (value: unknown) => {
    const key = newKey();
    insert(items.length, key);
    setFresh((list) => [...list, key]);
    write([...items, value]);
  };

  const controls = (
    <div className="mt-1 flex flex-wrap gap-2">
      {itemShape.kind === "union" ? (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong p-2.5">
          <span className="label-mono px-1">Add</span>
          {itemShape.variants.map((variant) => (
            <Btn
              key={String(variant.properties?.[itemShape.discriminator]?.const)}
              size="sm"
              icon={Plus}
              disabled={items.length >= max}
              onClick={() => add(blankValue(variant))}
            >
              {variantLabel(variant, itemShape.discriminator)}
            </Btn>
          ))}
        </div>
      ) : (
        <AddButton onClick={() => add(blankSolid(itemSchema))} disabled={items.length >= max}>
          Add {singular(label)}
        </AddButton>
      )}
    </div>
  );

  const list = (
    <div data-field={id}>
      {issues.get(at) && <p className="mb-3 text-[0.78rem] text-danger">{issues.get(at)}</p>}
      {items.length === 0 && (
        <p className="rounded-xl border border-line bg-white/[0.015] px-4 py-5 text-center text-[0.82rem] text-faint">
          Nothing here yet.
        </p>
      )}
      <ol className="space-y-2.5">
        {items.map((item, i) => (
          <ItemCard
            key={keys[i]}
            schema={itemSchema}
            shape={itemShape}
            value={item}
            at={childKey(at, i)}
            name={name}
            index={i}
            count={items.length}
            defaultOpen={items.length <= 2 || fresh.includes(keys[i])}
            canRemove={items.length > min}
            canDuplicate={items.length < max}
            onMove={(to) => {
              move(i, to);
              write(moved(items, i, to));
            }}
            onDuplicate={() => {
              const key = newKey();
              insert(i + 1, key);
              setFresh((list) => [...list, key]);
              write([...items.slice(0, i + 1), structuredClone(item), ...items.slice(i + 1)]);
            }}
            onRemove={() => {
              remove(i);
              write(items.filter((_, j) => j !== i));
            }}
          />
        ))}
      </ol>
      {controls}
    </div>
  );

  if (bare) return list;
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      wide
      labelAsText
      aside={<span className="font-mono text-[0.66rem] text-faint">{items.length}</span>}
    >
      {list}
    </FieldShell>
  );
}

function ItemCard({
  schema,
  shape,
  value,
  at,
  name,
  index,
  count,
  defaultOpen,
  canRemove,
  canDuplicate,
  onMove,
  onDuplicate,
  onRemove,
}: {
  schema: JsonSchema;
  shape: Shape;
  value: unknown;
  at: string;
  name: string;
  index: number;
  count: number;
  defaultOpen: boolean;
  canRemove: boolean;
  canDuplicate: boolean;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { issues } = useForm();
  const [open, setOpen] = useState(defaultOpen);
  const flagged = hasIssueWithin(issues, at);
  // A card with a problem stays open until it's fixed.
  const expanded = open || flagged;
  const bodyId = `${fieldId(at)}-body`;
  const variant = shape.kind === "union" ? variantOf(shape, value) : undefined;
  const summary = summarize(isRecord(value) && shape.kind === "union" ? { ...value, [shape.discriminator]: undefined } : value);

  return (
    <li
      className={cn(
        "rounded-2xl border bg-white/[0.015] transition-[border-color,background-color,box-shadow] duration-300",
        flagged ? "border-danger/45" : expanded ? "border-line-strong bg-white/[0.022]" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-1 py-1.5 pl-2 pr-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setOpen(!expanded)}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 text-left transition-colors hover:bg-white/[0.02]"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-faint transition-transform duration-300 ease-out-expo", expanded && "rotate-90")}
            aria-hidden="true"
          />
          <span className="font-mono text-[0.68rem] text-em/90">{pad(index + 1)}</span>
          {variant && shape.kind === "union" && <Badge tone="info">{variantLabel(variant, shape.discriminator)}</Badge>}
          <span className={cn("truncate text-[0.86rem]", summary ? "text-ink" : "italic text-faint")}>
            {summary || `New ${singular(humanize(name))}`}
          </span>
          {flagged && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-danger" aria-label="Has problems" />}
        </button>
        <div className="flex shrink-0 items-center">
          <IconBtn icon={ArrowUp} label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)} />
          <IconBtn icon={ArrowDown} label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)} />
          <IconBtn icon={Copy} label="Duplicate" disabled={!canDuplicate} onClick={onDuplicate} className="hidden sm:grid" />
          <IconBtn icon={Trash2} label="Remove" tone="danger" disabled={!canRemove} onClick={onRemove} />
        </div>
      </div>
      {expanded && (
        <div id={bodyId} className="animate-rise-in border-t border-line px-4 py-5 [animation-duration:0.5s] sm:px-5">
          {shape.kind === "union" ? (
            <UnionField schema={schema} shape={shape} value={value} at={at} name={name} label={humanize(name)} required bare />
          ) : shape.kind === "object" ? (
            <ObjectBody schema={shape.schema} value={value} at={at} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field schema={schema} value={value} at={at} name={name} label={`Item ${index + 1}`} required />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ── Anything else: raw JSON ──────────────────────────────── */

function JsonField({ value, at, name, label, required, order }: FieldProps & { label: string }) {
  const { set, issues } = useForm();
  const id = fieldId(at);
  const [text, setText] = useState(() => (value === undefined ? "" : JSON.stringify(value, null, 2)));
  const [invalid, setInvalid] = useState(false);
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hintFor(at, name) ?? "Advanced: edited as JSON."}
      error={invalid ? "Not valid JSON yet." : issues.get(at)}
      wide
    >
      <AutoTextarea
        id={id}
        mono
        value={text}
        invalid={invalid}
        onValue={(next) => {
          setText(next);
          if (next.trim() === "") {
            setInvalid(false);
            return set(at, undefined, order);
          }
          try {
            set(at, JSON.parse(next), order);
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
    </FieldShell>
  );
}
