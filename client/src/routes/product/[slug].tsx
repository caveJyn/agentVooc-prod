import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { apiClient } from "@/lib/api";
import { PortableText } from "@portabletext/react";
import Navbar from "@/components/navbar";

interface ProductPage {
  title: string;
  slug: { current: string };
  content?: Array<any>;
  lastUpdated: string;
  excerpt: string;
  mainImage?: string;
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<ProductPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
  const defaultImage = `${baseUrl}/images/logo.png`; // Replace with your default image URL

  useEffect(() => {
    const fetchPage = async () => {
      if (!slug) return;
      try {
        const response = await apiClient.getProductPageBySlug(slug);
        setPage(response.productPages);
      } catch (err: any) {
        console.error(`Error fetching product page for slug: ${slug}`, err);
        setError(err.message || "Failed to fetch product page");
      }
    };

    fetchPage();
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
        <Helmet>
          <title>agentVooc | Error</title>
          <meta name="description" content="An error occurred while fetching the product page." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Error</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
        <Helmet>
          <title>agentVooc | Loading</title>
          <meta name="description" content="Loading product page..." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    headline: page.title,
    description: page.excerpt,
    dateModified: page.lastUpdated,
    image: page.mainImage || defaultImage,
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
        <title>agentVooc | {page.title}</title>
        <meta name="description" content={page.excerpt} />
        <meta name="keywords" content="AI automation, agentVooc, product, technology" />
        <meta name="robots" content="index, follow" />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <link rel="canonical" href={`${baseUrl}/product/${page.slug.current}`} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`${baseUrl}/product/${page.slug.current}`} />
        <meta property="og:image" content={page.mainImage || defaultImage} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={page.title} />
        <meta name="twitter:description" content={page.excerpt} />
        <meta name="twitter:image" content={page.mainImage || defaultImage} />
        <meta name="twitter:site" content="@agentVooc" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <Navbar />
      <div className="max-w-6xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold mb-4">{page.title}</h1>
        <p className="text-sm text-gray-500 mb-8">
          Last Updated: {new Date(page.lastUpdated).toLocaleDateString()}
        </p>
        <div className="prose prose-invert">
          <PortableText value={page.content} />
        </div>
      </div>
    </div>
  );
}