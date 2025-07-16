import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface FooterSection {
  tagline: string;
  companyLinks: Array<{ label: string; url: string }>;
  productLinks: Array<{ label: string; url: string }>;
  legalLinks: Array<{ label: string; url: string }>;
}

interface LegalDocument {
  title: string;
  slug: { current: string };
  lastUpdated: string;
}

interface CompanyPage {
  title: string;
  slug: { current: string };
  lastUpdated: string;
}

interface ProductPage {
  title: string;
  slug: { current: string };
  lastUpdated: string;
}

interface FooterProps {
  footerSection: FooterSection;
}

export const Footer = ({ footerSection }: FooterProps) => {
  const [legalLinks, setLegalLinks] = useState<Array<{ label: string; url: string }>>(
    footerSection.legalLinks.length > 0
      ? footerSection.legalLinks
      : [
          { label: "Privacy Policy", url: "/legal/privacy" },
          { label: "Terms of Service", url: "/legal/terms" },
        ]
  );
  const [companyLinks, setCompanyLinks] = useState<Array<{ label: string; url: string }>>(
    footerSection.companyLinks.length > 0
      ? footerSection.companyLinks
      : [
          { label: "About", url: "/company/about" },
          { label: "Careers", url: "/company/careers" },
          { label: "Contact", url: "/company/contact" },
          { label: "Blog", url: "/company/blog" },
          { label: "Press", url: "/company/press" },
          { label: "Community", url: "/company/community" },
        ]
  );
  const [productLinks, setProductLinks] = useState<Array<{ label: string; url: string }>>(
    footerSection.productLinks.length > 0
      ? footerSection.productLinks
      : [
          { label: "Features", url: "/product/features" },
          { label: "Pricing", url: "/product/pricing" },
          { label: "Documentation", url: "/product/docs" },
        ]
  );

  useEffect(() => {
    const fetchLegalDocuments = async () => {
      try {
        const response = await apiClient.getLegalDocuments();
        const links = response.legalDocuments.map((doc: LegalDocument) => ({
          label: doc.title,
          url: `/legal/${doc.slug.current}`,
        }));
        setLegalLinks(links.length > 0 ? links : legalLinks);
      } catch (err: any) {
        console.error("Error fetching legal documents for footer:", err);
        // Retain fallback links if fetch fails
      }
    };

    const fetchCompanyPages = async () => {
      try {
        const response = await apiClient.getCompanyPages();
        const links = response.companyPages
          .filter((page: CompanyPage) => !["blog", "press"].includes(page.slug.current))
          .map((page: CompanyPage) => ({
            label: page.title,
            url: `/company/${page.slug.current}`,
          }))
          .concat([
            { label: "Blog", url: "/company/blog" },
            { label: "Press", url: "/company/press" },
          ]);
        setCompanyLinks(links.length > 0 ? links : companyLinks);
      } catch (err: any) {
        console.error("Error fetching company pages for footer:", err);
        // Retain fallback links if fetch fails
      }
    };

    const fetchProductPages = async () => {
      try {
        const response = await apiClient.getProductPages();
        const links = response.productPages.map((page: ProductPage) => ({
          label: page.title,
          url: `/product/${page.slug.current}`,
        }));
        setProductLinks(links.length > 0 ? links : productLinks);
      } catch (err: any) {
        console.error("Error fetching product pages for footer:", err);
        // Retain fallback links if fetch fails
      }
    };

    fetchLegalDocuments();
    fetchCompanyPages();
    fetchProductPages();
  }, []);

  const tagline =
    footerSection.tagline || "Empowering the future with AI automation.";

  return (
    <footer className="py-12 px-4 bg-agentvooc-primary-bg-dark border-t border-agentvooc-border text-agentvooc-secondary animate-fade-in">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <section aria-label="About agentVooc">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            agentVooc
          </h3>
          <p>{tagline}</p>
        </section>
        <section aria-label="Company Links">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            Company
          </h3>
          <ul className="space-y-2">
            {companyLinks.map((link, index) => (
              <li key={index}>
                <a href={link.url} className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Product Links">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            Product
          </h3>
          <ul className="space-y-2">
            {productLinks.map((link, index) => (
              <li key={index}>
                <a href={link.url} className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Legal Links">
          <h3 className="text-lg font-semibold text-agentvooc-primary mb-4">
            Legal
          </h3>
          <ul className="space-y-2">
            {/* {legalLinks.map((link, index) => (
              <li key={index}>
                <a href={link.url} className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link">
                  {link.label}
                </a>
              </li>
            ))} */}
            <li>
              <a href="/api/sitemap.xml" className="text-agentvooc-secondary hover:text-agentvooc-accent footer-link">
                Sitemap
              </a>
            </li>
          </ul>
        </section>
      </div>
    </footer>
  );
};
