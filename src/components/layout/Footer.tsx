import { useTranslations } from "next-intl";
import { Globe, MessageCircle, Mail } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { footerGroups } from "@/lib/data";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="relative border-t border-border bg-background-alt">
      <Container className="py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Logo className="h-8 w-8" />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Colega
              </span>
            </Link>
            <p className="max-w-[220px] text-sm leading-relaxed text-muted-dim">
              {t("tagline")}
            </p>
            <div className="flex items-center gap-3 pt-2">
              {[Globe, MessageCircle, Mail].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="Social link"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {footerGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-foreground">
                {t(`groups.${group.id}`)}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-dim transition-colors hover:text-foreground"
                    >
                      {t(`links.${link.id}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-xs text-muted-dim sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Colega. {t("rights")}</p>
          <p>{t("madeFor")}</p>
        </div>
      </Container>
    </footer>
  );
}
