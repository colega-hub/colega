import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { comparisonRows } from "@/lib/data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm text-foreground/90">{value}</span>;
  }
  return value ? (
    <Check size={18} className="mx-auto text-accent-strong" />
  ) : (
    <Minus size={18} className="mx-auto text-muted-dim/50" />
  );
}

export function ComparisonTable() {
  const t = useTranslations("pricing.comparison");

  return (
    <section id="compare" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <Reveal delay={0.1} className="mt-14 overflow-x-auto">
          <div className="card-surface min-w-[640px] rounded-2xl">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-5 text-sm font-medium text-muted">
                    {t("columns.feature")}
                  </th>
                  <th className="px-6 py-5 text-center text-sm font-semibold text-foreground">
                    {t("columns.starter")}
                  </th>
                  <th className="px-6 py-5 text-center text-sm font-semibold text-accent-strong">
                    {t("columns.pro")}
                  </th>
                  <th className="px-6 py-5 text-center text-sm font-semibold text-foreground">
                    {t("columns.team")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={i % 2 === 0 ? "bg-white/[0.015]" : ""}
                  >
                    <td className="px-6 py-4 text-sm text-muted">
                      {t(`rows.${row.id}`)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Cell value={row.starter} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Cell value={row.pro} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Cell value={row.team} />
                    </td>
                  </tr>
                ))}
                <tr className={comparisonRows.length % 2 === 0 ? "bg-white/[0.015]" : ""}>
                  <td className="px-6 py-4 text-sm text-muted">
                    {t("rows.workspaces")}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell value={t("values.workspacesStarter")} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell value={t("values.workspacesPro")} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell value={t("values.workspacesTeam")} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
