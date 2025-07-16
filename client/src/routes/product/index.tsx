import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { apiClient } from "@/lib/api";
import Navbar from "@/components/navbar";
import { Footer } from "@/components/landing/footer";
import { SubFooter } from "@/components/landing/sub-footer";

interface ProductPage {
  title: string;
  slug: { current: string };
  lastUpdated: string;
  excerpt: string;
  mainImage?: string;
}

const fallbackFooterSection = {
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
    { label: "Documentation", url: "/docs" },
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

const fallbackSubFooterSection = {
  ctaText: "Still Not Sure?",
  ctaUrl: "/demo",
  copyright: "© 2025 agentVooc. All rights reserved.",
};

interface StarPosition {
  top: string;
  left: string;
  width: string;
  height: string;
  animationDelay: string;
  animationDuration: string;
}

export default function ProductListPage() {
  const [pages, setPages] = useState<ProductPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [footerSection, setFooterSection] = useState(fallbackFooterSection);
  const [subFooterSection, setSubFooterSection] = useState(fallbackSubFooterSection);
  const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
  const defaultImage = `${baseUrl}/images/logo.png`;

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const response = await apiClient.getProductPages();
        setPages(response.productPages);
      } catch (err: any) {
        console.error("Error fetching product pages:", err);
        setError(err.message || "Failed to fetch product pages");
      }
    };

    const fetchLandingPage = async () => {
      try {
        const response = await apiClient.getLandingPage();
        setFooterSection(response.landingPage.footerSection);
        setSubFooterSection(response.landingPage.subFooterSection);
      } catch (err: any) {
        console.error("Error fetching landing page for footer:", err);
      }
    };

    const positions = [...Array(20)].map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      width: `${Math.random() * 4 + 2}px`,
      height: `${Math.random() * 4 + 2}px`,
      animationDelay: `${Math.random() * 5}s`,
      animationDuration: `${Math.random() * 3 + 2}s`,
    }));
    setStarPositions(positions);

    fetchPages();
    fetchLandingPage();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
        <Helmet>
          <title>agentVooc | Products</title>
          <meta name="description" content="An error occurred while fetching the product pages." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Products</h1>
          <p>{error}</p>
        </div>
        <Footer footerSection={footerSection} />
        <SubFooter subFooterSection={subFooterSection} />
      </div>
    );
  }

  return (
    <section
      className="min-h-screen relative overflow-hidden"
      style={
        pages[0]?.mainImage
          ? {
              backgroundImage: `url(${pages[0]?.mainImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <Helmet>
        <title>agentVooc | Products</title>
        <meta name="description" content="Explore agentVooc's AI-powered products for automation and innovation." />
        <meta name="keywords" content="AI automation, agentVooc, products, technology" />
        <meta name="robots" content="index, follow" />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <meta property="og:title" content="Products | agentVooc" />
        <meta property="og:description" content="Explore agentVooc's AI-powered products for automation and innovation." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${baseUrl}/product`} />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Products | agentVooc" />
        <meta name="twitter:description" content="Explore agentVooc's AI-powered products for automation and innovation." />
        <meta name="twitter:image" content={defaultImage} />
        <meta name="twitter:site" content="@agentVooc" />
      </Helmet>
      <Navbar />
      <div className="absolute inset-0 bg-gradient-to-br from-agentvooc-primary-bg via-agentvooc-primary-bg-dark to-agentvooc-secondary-accent">
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div className="absolute -top-40 -right-32 opacity-5 pointer-events-none z-0">
        <div className="w-96 h-96 bg-agentvooc-accent rounded-full blur-3xl animate-pulse" />
      </div>
      <div className="absolute inset-0 pointer-events-none z-5">
        {starPositions.map((position, index) => (
          <div
            key={index}
            className="absolute bg-agentvooc-stars rounded-full animate-star-sequence"
            style={{
              width: position.width,
              height: position.height,
              top: position.top,
              left: position.left,
              animationDelay: position.animationDelay,
              animationDuration: position.animationDuration,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 w-full max-w-6xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold mb-8 text-white">Products</h1>
        {pages.length === 0 ? (
          <p className="text-white">No product pages available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pages.map((page) => (
              <Link
                key={page.slug.current}
                to={`/product/${page.slug.current}`}
                className="block p-6 bg-agentvooc-secondary-bg rounded-lg hover:bg-agentvooc-accent transition text-white"
              >
                {page.mainImage && (
                  <img
                    src={page.mainImage}
                    alt={page.title}
                    className="w-full h-48 object-cover rounded-t-lg mb-4 hidden md:block"
                  />
                )}
                <h2 className="text-xl font-semibold mb-2">{page.title}</h2>
                <p className="text-sm text-gray-300 mb-4">
                  Last Updated: {new Date(page.lastUpdated).toLocaleDateString()}
                </p>
                <p>{page.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer footerSection={footerSection} />
      <SubFooter subFooterSection={subFooterSection} />
    </section>
  );
}
