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

const fallbackFooterSection: FooterSection = {
  tagline: "Empowering the future with AI automation.",
  companyLinks: [
    { label: "About", url: "/company/about" },
    { label: "Careers", url: "/company/careers" },
    { label: "Contact", url: "/company/contact" },
    { label: "Blog", url: "/company/blog" },
    { label: "Press", url: "/company/press" },
    { label: "Community", url: "/company/community" },
  ],
  productLinks: [
    { label: "Features", url: "/features" },
    { label: "Pricing", url: "/pricing" },
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
  copyright: "© 2025 agentVooc. All rights reserved.",
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
  const [footerSection, setFooterSection] = useState(fallbackFooterSection);
  const [subFooterSection, setSubFooterSection] = useState(fallbackSubFooterSection);

  useEffect(() => {
    const fetchLandingPage = async () => {
      try {
        const response = await apiClient.getLandingPage();
        setFooterSection(response.landingPage.footerSection || fallbackFooterSection);
        setSubFooterSection(response.landingPage.subFooterSection || fallbackSubFooterSection);
      } catch (err: any) {
        console.error("Error fetching landing page for footer:", err);
        setFooterSection(fallbackFooterSection);
        setSubFooterSection(fallbackSubFooterSection);
      }
    };
    fetchLandingPage();
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