import type { Metadata } from "next";
import { PenLine, Users } from "lucide-react";
import { CardsEditor, type PreviewPerson } from "@/components/admin/cards-editor";
import type { Raw } from "@/components/admin/form/schema-utils";
import { CARDS_ICON } from "@/components/admin/icons";
import { BtnLink } from "@/components/admin/ui";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { cardsForm } from "@/lib/admin/form-schema";
import { editorHistory } from "@/lib/admin/history";
import { CARDS_META } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import { docLocation, pageVersion, readSnapshot } from "@/lib/admin/store";
import { hasCard, resolveCardPerson } from "@/lib/cards/person";
import { rawPages } from "@/lib/content/raw";
import { cardDesignSchema, settingsSchema, teamMemberSchema, type CardDesign } from "@/lib/schemas";

export const metadata: Metadata = { title: CARDS_META.label };

/**
 * Business cards: the colours, QR code and contact rows every team member's
 * card shares, with a live preview. Stored in the cards page (`design`), so
 * saving, conflicts and History work exactly as they do for that page.
 */
export default async function BusinessCardsPage() {
  const { config, user } = await requireSession();
  const target = { kind: "page", key: CARDS_META.page } as const;
  const [snapshot, history] = await Promise.all([readSnapshot(), editorHistory(target, config.base)]);
  const data = (snapshot.pages[target.key] ?? null) as Raw | null;

  // The preview draws real cards: every team member, with the studio's details as fallbacks.
  const settings = settingsSchema.safeParse(snapshot.settings);
  const people: PreviewPerson[] = settings.success
    ? (snapshot.collections.team ?? []).flatMap((raw) => {
        const parsed = teamMemberSchema.safeParse(raw);
        if (!parsed.success) return [];
        const member = parsed.data;
        const note = member.published === false ? "hidden on the site" : !hasCard(member) ? "card switched off" : undefined;
        return [
          {
            person: resolveCardPerson(member, settings.data),
            note,
            editHref: adminHref(config.base, `/collections/team/${member.slug}`),
          },
        ];
      })
    : [];
  // Cards on the site first.
  people.sort((a, b) => Number(!!a.note) - Number(!!b.note));

  const saved = cardDesignSchema.safeParse(isRecord(data) ? data.design : undefined);
  const fallback: CardDesign = saved.success ? saved.data : cardDesignSchema.parse((rawPages.cards as { design: unknown }).design);

  return (
    <CardsEditor
      base={config.base}
      target={target}
      title={CARDS_META.label}
      eyebrow="Team"
      file={docLocation(target)}
      form={cardsForm(snapshot)}
      initial={data}
      version={pageVersion(data)}
      publicHref={CARDS_META.href}
      allowed={{ delete: false, layout: can(user.role, "layout") }}
      history={history}
      people={people}
      fallback={fallback}
      intro={<CardsIntro base={config.base} />}
    />
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Where the rest of a card comes from: each person's Team entry, and the page's own copy. */
function CardsIntro({ base }: { base: string }) {
  const Icon = CARDS_ICON;
  return (
    <div className="card animate-rise-in flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-em/30 bg-em/[0.08] text-em">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.88rem] font-medium text-ink">One design, a card for everyone on the team</span>
          <span className="block text-[0.8rem] leading-relaxed text-muted">
            Every visible team member gets a card at /cards/their-slug. Their own phone, email and website go on their Team entry; anything left
            empty uses the studio&apos;s details from Site settings.
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <BtnLink href={adminHref(base, "/collections/team")} size="sm" variant="ghost" icon={Users}>
          Team
        </BtnLink>
        <BtnLink href={adminHref(base, `/pages/${CARDS_META.page}`)} size="sm" variant="ghost" icon={PenLine}>
          Page copy
        </BtnLink>
      </div>
    </div>
  );
}
