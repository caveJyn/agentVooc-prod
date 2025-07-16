import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { apiClient } from "@/lib/api";
import { PortableText } from "@portabletext/react";
import Navbar from "@/components/navbar";
import { Footer } from "@/components/landing/footer";
import { SubFooter } from "@/components/landing/sub-footer";

interface BlogPost {
  title: string;
  slug: { current: string };
  content?: Array<any>;
  publishedAt: string;
  excerpt: string;
  mainImage?: string;
  thumbnailImage?: string;
  mediumImage?: string;
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

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [footerSection, setFooterSection] = useState(fallbackFooterSection);
  const [subFooterSection, setSubFooterSection] = useState(fallbackSubFooterSection);

  const baseUrl = import.meta.env.SERVER_URL;
  const defaultImage = `${baseUrl}/images/logo.png`; // Replace with your default image URL

  useEffect(() => {
    const fetchPost = async () => {
      if (!slug) return;
      try {
        const response = await apiClient.getBlogPostBySlug(slug);
        setPost(response.blogPosts);
      } catch (err: any) {
        console.error(`Error fetching blog post for slug: ${slug}`, err);
        setError(err.message || "Failed to fetch blog post");
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

    fetchPost();
    fetchLandingPage();
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
        <Helmet>
          <title>agentVooc | Error</title>
          <meta name="description" content="An error occurred while fetching the blog post." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Error</h1>
          <p>{error}</p>
        </div>
        <Footer footerSection={footerSection} />
        <SubFooter subFooterSection={subFooterSection} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
        <Helmet>
          <title>agentVooc | Loading</title>
          <meta name="description" content="Loading blog post..." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <p>Loading...</p>
        </div>
        <Footer footerSection={footerSection} />
        <SubFooter subFooterSection={subFooterSection} />
      </div>
    );
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    image: post.mainImage || defaultImage,
    publisher: {
      "@type": "Organization",
      name: "agentVooc",
      logo: {
        "@type": "ImageObject",
        url: defaultImage,
      },
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
      <Helmet>
        <title>agentVooc | {post.title}</title>
        <meta name="description" content={post.excerpt} />
        <meta name="keywords" content="AI automation, agentVooc, blog, technology" />
        <meta name="robots" content="index, follow" />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <link rel="canonical" href={`${baseUrl}/company/blog/${post.slug.current}`} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`${baseUrl}/company/blog/${post.slug.current}`} />
        <meta property="og:image" content={post.mainImage || defaultImage} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />
        <meta name="twitter:image" content={post.mainImage || defaultImage} />
        <meta name="twitter:site" content="@agentVooc" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <Navbar />
      <div className="max-w-6xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
        <p className="text-sm text-gray-500 mb-8">
          Published: {new Date(post.publishedAt).toLocaleDateString()}
        </p>
        <div className="prose prose-invert">
          <PortableText value={post.content} />
        </div>
      </div>
      <Footer footerSection={footerSection} />
      <SubFooter subFooterSection={subFooterSection} />
    </div>
  );
}