import { getTranslations } from "next-intl/server";
import { SimplePage } from "@/components/layout/SimplePage";

type LegalSection = { heading: string; paragraphs?: string[]; items?: string[] };

const EMAIL_RE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})/g;

// Renders plain message text, turning any e-mail address into a mailto link.
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(EMAIL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={`mailto:${part}`} className="text-accent-strong hover:text-accent">
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}

/** Terms / Privacy / Refund pages — structured sections from messages/<locale>.json legal.<doc>. */
export async function LegalPage({ locale, doc }: { locale: string; doc: "terms" | "privacy" | "refund" }) {
  const t = await getTranslations({ locale, namespace: `legal.${doc}` });
  const tLegal = await getTranslations({ locale, namespace: "legal" });
  const intro = t.raw("intro") as string[];
  const sections = t.raw("sections") as LegalSection[];

  return (
    <SimplePage eyebrow={t("eyebrow")} title={t("title")}>
      <p className="text-xs text-muted-dim">{tLegal("lastUpdated", { date: tLegal("updatedOn") })}</p>
      {intro.map((paragraph) => (
        <p key={paragraph}>
          <RichText text={paragraph} />
        </p>
      ))}
      {sections.map((section) => (
        <section key={section.heading} className="mt-4 flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>
              <RichText text={paragraph} />
            </p>
          ))}
          {section.items && (
            <ul className="flex list-disc flex-col gap-2 pl-5">
              {section.items.map((item) => (
                <li key={item}>
                  <RichText text={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </SimplePage>
  );
}
