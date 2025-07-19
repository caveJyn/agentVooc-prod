import { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface FooterSection {
  tagline: string;
  companyLinks: Array<{ label: string; url: string }>;
  productLinks: Array<{ label: string; url: string }>;
  legalLinks: Array<{ label: string; url: string }>;
}

interface SubFooterSection {
  ctaText: string;
  ctaUrl: string;
  copyright: string;
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
  publishedAt: string;
  modifiedAt?: string;
}

const fallbackFooterSection: FooterSection = {
  tagline: "Empowering the future with AI automation.",
  companyLinks: [
    { label: "About", url: "/company/about" },
    { label: "Blog", url: "/company/blog" },
    { label: "Press", url: "/company/press" },
  ],
  productLinks: [
    { label: "Pricing", url: "/product/pricing" },
  ],
  legalLinks: [
    { label: "Privacy Policy", url: "/legal/privacy" },
    { label: "Terms of Service", url: "/legal/terms" },
    { label: "DMCA Policy", url: "/legal/dmca" },
    { label: "Trademark Guidelines", url: "/legal/trademark" },
    { label: "Content Moderation Policy", url: "/legal/content-moderation" },
    { label: "Payment Policies", url: "/legal/payment-policies" },
  ],
};

const fallbackSubFooterSection: SubFooterSection = {
  ctaText: "Still Not Sure?",
  ctaUrl: "/demo",
  copyright: `© ${new Date().getFullYear()} agentVooc. All rights reserved.`,
};

interface FooterContextType {
  footerSection: FooterSection;
  subFooterSection: SubFooterSection;
}

const FooterContext = createContext<FooterContextType>({
  footerSection: fallbackFooterSection,
  subFooterSection: fallbackSubFooterSection,
});

export function FooterProvider({ children }: { children: React.ReactNode }) {
  const [footerSection, setFooterSection] = useState<FooterSection>(fallbackFooterSection);
  const [subFooterSection, setSubFooterSection] = useState<SubFooterSection>(fallbackSubFooterSection);

  useEffect(() => {
    const fetchFooterData = async () => {
      const cacheKey = "footerData";
      const cacheTimestampKey = "footerDataUpdatedAt";
      const cacheTimeKey = "footerDataCacheTime";
      const cacheDuration = 24 * 60 * 60 * 1000; // 24 hours

      const cachedData = localStorage.getItem(cacheKey);
      const cachedUpdatedAt = localStorage.getItem(cacheTimestampKey);
      const cachedTime = localStorage.getItem(cacheTimeKey);

      if (cachedData && cachedUpdatedAt && cachedTime) {
        const isCacheValid = Date.now() - parseInt(cachedTime) < cacheDuration;
        if (isCacheValid) {
          try {
            const response = await apiClient.getLandingPage();
            const serverUpdatedAt = response.landingPage._updatedAt;
            if (serverUpdatedAt === cachedUpdatedAt) {
              const cachedFooter = JSON.parse(cachedData);
              setFooterSection(cachedFooter.footerSection);
              setSubFooterSection(cachedFooter.subFooterSection);
              return;
            }
          } catch (err: any) {
            console.error("Error checking footer data update:", err);
            const cachedFooter = JSON.parse(cachedData);
            setFooterSection(cachedFooter.footerSection);
            setSubFooterSection(cachedFooter.subFooterSection);
            return;
          }
        }
      }

      try {
        // Fetch landing page for footerSection and subFooterSection
        const landingResponse = await apiClient.getLandingPage();
        const landingFooter = landingResponse.landingPage.footerSection || fallbackFooterSection;
        const landingSubFooter = landingResponse.landingPage.subFooterSection || fallbackSubFooterSection;

        // Fetch dynamic links
        const [legalResponse, companyResponse, productResponse, blogResponse, pressResponse] = await Promise.all([
          apiClient.getLegalDocuments(),
          apiClient.getCompanyPages(),
          apiClient.getProductPages(),
          apiClient.getBlogPosts(),
          apiClient.getPressPosts(),
        ]);

        const legalLinks = legalResponse.legalDocuments.map((doc: LegalDocument) => ({
          label: doc.title,
          url: `/legal/${doc.slug.current}`,
        }));

        const companyLinks = companyResponse.companyPages
          .filter((page: CompanyPage) => !["blog", "press"].includes(page.slug.current))
          .map((page: CompanyPage) => ({
            label: page.title,
            url: `/company/${page.slug.current}`,
          }));

        // Add blog and press links
        const blogLinks = blogResponse.blogPosts.length > 0
          ? [{ label: "Blog", url: "/company/blog" }]
          : [];
        const pressLinks = pressResponse.pressPosts.length > 0
          ? [{ label: "Press", url: "/company/press" }]
          : [];

        const productLinks = productResponse.productPages.map((page: ProductPage) => ({
          label: page.title,
          url: `/product/${page.slug.current}`,
        }));

        const updatedFooterSection = {
          tagline: landingFooter.tagline || fallbackFooterSection.tagline,
          companyLinks: [
            ...(companyLinks.length > 0 ? companyLinks : landingFooter.companyLinks || []),
            ...blogLinks,
            ...pressLinks,
          ],
          productLinks: productLinks.length > 0 ? productLinks : landingFooter.productLinks || fallbackFooterSection.productLinks,
          legalLinks: legalLinks.length > 0 ? legalLinks : landingFooter.legalLinks || fallbackFooterSection.legalLinks,
        };

        setFooterSection(updatedFooterSection);
        setSubFooterSection(landingSubFooter);

        // Cache the data
        const cacheData = { footerSection: updatedFooterSection, subFooterSection: landingSubFooter };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        localStorage.setItem(cacheTimestampKey, landingResponse.landingPage._updatedAt || Date.now().toString());
        localStorage.setItem(cacheTimeKey, Date.now().toString());
      } catch (err: any) {
        console.error("Error fetching footer data:", err);
        setFooterSection(fallbackFooterSection);
        setSubFooterSection(fallbackSubFooterSection);
      }
    };
    fetchFooterData();
  }, []);

  return (
    <FooterContext.Provider value={{ footerSection, subFooterSection }}>
      {children}
    </FooterContext.Provider>
  );
}

export function useFooter() {
  return useContext(FooterContext);
}