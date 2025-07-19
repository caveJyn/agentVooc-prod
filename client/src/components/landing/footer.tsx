import { useFooter } from "@/context/footerContext";

export function Footer() {
  const { footerSection, subFooterSection } = useFooter();

  return (
    <footer className="py-12 px-4 bg-agentvooc-primary-bg border-t border-agentvooc-border text-agentvooc-secondary animate-fade-in">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <section aria-label="About agentVooc">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            agentVooc
          </h3>
          <p>{footerSection.tagline}</p>
        </section>
        <section aria-label="Company Links">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            Company
          </h3>
          <ul className="space-y-2">
            {footerSection.companyLinks.length > 0 ? (
              footerSection.companyLinks.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.url}
                    className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link"
                  >
                    {link.label}
                  </a>
                </li>
              ))
            ) : (
              <li className="text-agentvooc-secondary">No company links available.</li>
            )}
          </ul>
        </section>
        <section aria-label="Product Links">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            Product
          </h3>
          <ul className="space-y-2">
            {footerSection.productLinks.length > 0 ? (
              footerSection.productLinks.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.url}
                    className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link"
                  >
                    {link.label}
                  </a>
                </li>
              ))
            ) : (
              <li className="text-agentvooc-secondary">No product links available.</li>
            )}
          </ul>
        </section>
        <section aria-label="Legal Links">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            Legal
          </h3>
          <ul className="space-y-2">
            {/* {footerSection.legalLinks.length > 0 ? (
              footerSection.legalLinks.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.url}
                    className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link"
                  >
                    {link.label}
                  </a>
                </li>
              ))
            ) : (
              <li className="text-agentvooc-secondary">No legal links available.</li>
            )} */}
            <li>
              <a
                href="/api/sitemap.xml"
                className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link"
              >
                Sitemap
              </a>
            </li>
          </ul>
        </section>
      </div>
      <div className="mt-8 pt-8 border-t border-agentvooc-border text-center">
        <a
          href={subFooterSection.ctaUrl}
          className="text-agentvooc-accent hover:underline"
        >
          {subFooterSection.ctaText}
        </a>
        <p className="mt-4 text-sm">{subFooterSection.copyright}</p>
      </div>
    </footer>
  );
}