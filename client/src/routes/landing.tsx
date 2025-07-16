// /home/cave/projects/bots/venv/elizaOS_env/eliza-main/client/src/routes/landing.tsx
import { useEffect, useState, useRef } from "react";
import AuthSelection from "@/components/auth-selection";
import Navbar from "@/components/navbar";
import Subscriptions from "@/components/subscriptions";
import { FeaturesSection } from "@/components/landing/features-section";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import { SubFooter } from "@/components/landing/sub-footer";
import { apiClient } from "@/lib/api";
import { Hero } from "@/components/landing/hero";

interface ImageVariants {
  main: string;
  thumbnail: string;
  medium: string;
}

interface LandingPage {
  title: string;
  slug: { current: string };
  heroSection: {
    title: string;
    subtitle: string;
    primaryCtaText: string;
    secondaryCtaText?: string;
    trustSignal?: string;
    backgroundImage?: ImageVariants;
  };
  featuresSection: {
    heading: string;
    features: Array<{
      title: string;
      description: string;
      icon?: ImageVariants;
    }>;
    ctaText: string;
  };
  benefitsSection: {
    heading: string;
    description: string;
    benefitsList: string[];
    image: ImageVariants;
  };
  testimonialsSection: {
    heading: string;
    testimonials: Array<{
      quote: string;
      author: string;
      role: string;
      image?: ImageVariants;
    }>;
    trustSignal: string;
    sectionImage?: ImageVariants;
  };
  ctaSection: {
    heading: string;
    description: string;
    ctaText: string;
  };
  footerSection: {
    tagline: string;
    companyLinks: Array<{ label: string; url: string }>;
    productLinks: Array<{ label: string; url: string }>;
    legalLinks: Array<{ label: string; url: string }>;
  };
  subFooterSection: {
    ctaText: string;
    ctaUrl: string;
    copyright: string;
  };
}

// Fallback data based on original static components
const fallbackLandingPage: LandingPage = {
  title: "Welcome to agentVooc",
  slug: { current: "home" },
  heroSection: {
    title: "Welcome to the Future with agentVooc",
    subtitle: "Empower your decisions with intelligent AI agents and automation.",
    primaryCtaText: "Get Started",
  },
  featuresSection: {
    heading: "Why Choose agentVooc?",
    features: [
      {
        title: "Intelligent AI Agents",
        description: "Automate tasks with smart AI agents that learn and adapt.",
      },
      {
        title: "Seamless Automation",
        description: "Streamline workflows with one-click automation.",
      },
      {
        title: "Real-Time Insights",
        description: "Get actionable insights to make smarter decisions.",
      },
    ],
    ctaText: "Explore All Features",
  },
  benefitsSection: {
    heading: "Solve Your Biggest Challenges",
    description:
      "agentVooc helps you save time, make smarter decisions, and scale effortlessly with AI-driven automation.",
    benefitsList: [
      "Save Time with Automation",
      "Make Smarter Decisions",
      "Scale Effortlessly",
    ],
    image: {
      main: "/dashboard-screenshot.png",
      thumbnail: "/dashboard-screenshot.png",
      medium: "/dashboard-screenshot.png",
    },
  },
  testimonialsSection: {
    heading: "What Our Users Say",
    testimonials: [
      {
        quote: "agentVooc saved us 20 hours a week!",
        author: "Jane D.",
        role: "Tech Lead",
      },
      {
        quote: "The automation features are a game-changer.",
        author: "Mark Stupid.",
        role: "Entrepreneur",
      },
      {
        quote: "I love how easy it is to use.",
        author: "Sarah L.",
        role: "Developer",
      },
    ],
    trustSignal: "Join 10,000+ happy users automating their tasks.",
  },
  ctaSection: {
    heading: "Ready to Transform Your Workflow?",
    description: "Learn how to automate your email generation adn Join thousands of users automating their tasks with agentVooc.",
    ctaText: "How it Works",
  },
  footerSection: {
    tagline: "Empowering the future with AI automation.",
    companyLinks: [
      { label: "About", url: "/company/about" },
    ],
    productLinks: [
      { label: "Features", url: "/features" },
    ],
    legalLinks: [
      { label: "Privacy Policy", url: "/legal/privacy" },
    ],
  },
  subFooterSection: {
    ctaText: "Still Not Sure?",
    ctaUrl: "/demo",
    copyright: "© 2025 agentVooc. All rights reserved.",
  },
};

export default function Landing() {
  const [landingPage, setLandingPage] = useState<LandingPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for sections to apply Intersection Observer
  const heroRef = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const benefitsRef = useRef<HTMLElement>(null);
  const testimonialsRef = useRef<HTMLElement>(null);
  const subscriptionsRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);
  const authRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const fetchLandingPage = async () => {
      try {
        const response = await apiClient.getLandingPage();
        setLandingPage(response.landingPage);
      } catch (err: any) {
        console.error("Error fetching landing page:", err);
        setError(err.message || "Failed to fetch landing page");
        setLandingPage(fallbackLandingPage); // Use fallback data on error
      }
    };
    if (error) {
      // console.warn("Using fallback landing page data due to error:", error);
    }
    fetchLandingPage();
  }, [error]);

  // Intersection Observer for section visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    const sections = [
      heroRef.current,
      featuresRef.current,
      benefitsRef.current,
      testimonialsRef.current,
      subscriptionsRef.current,
      ctaRef.current,
      authRef.current,
    ];

    sections.forEach((section) => {
      if (section) {
        section.classList.add("animate"); // Add animate class to trigger fade-in
        observer.observe(section);
      }
    });

    return () => {
      sections.forEach((section) => {
        if (section) observer.unobserve(section);
      });
    };
  }, []);

  // Use fallback data if landingPage is null or an error occurred
  const pageData = landingPage || fallbackLandingPage;

  return (
    <main className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary animate-fade-in">
      <Navbar />
      <section ref={heroRef} aria-label="Hero Section">
        <Hero heroSection={pageData.heroSection} />
      </section>
      <section ref={featuresRef} aria-label="Features Section">
        <FeaturesSection featuresSection={pageData.featuresSection} />
      </section>
      <section ref={benefitsRef} aria-label="Benefits Section">
        <BenefitsSection benefitsSection={pageData.benefitsSection} />
      </section>
      <section ref={testimonialsRef} aria-label="Testimonials Section">
        <TestimonialsSection testimonialsSection={pageData.testimonialsSection} />
      </section>
      <section ref={subscriptionsRef} aria-label="Subscriptions Section" className="py-16 px-4">
        <Subscriptions />
      </section>
      <section ref={ctaRef} aria-label="Call to Action Section">
        <CTASection ctaSection={pageData.ctaSection} />
      </section>
      <section ref={authRef} id="auth" aria-label="Authentication Section" className="flex justify-center py-12">
        <AuthSelection />
      </section>
      <Footer footerSection={pageData.footerSection} />
      <SubFooter subFooterSection={pageData.subFooterSection} />
    </main>
  );
}
