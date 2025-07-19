import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import Navbar from "@/components/navbar";

interface PressPost {
  title: string;
  slug: { current: string };
  publishedAt: string;
  modifiedAt?: string;
  seoDescription: string;
  excerpt: string;
  mainImage?: string;
  mainImageAlt?: string;
  heroImage?: string;
  heroImageAlt?: string;
  thumbnailImage?: string;
  mediumImage?: string;
  tags?: string[];
}

interface StarPosition {
  top: string;
  left: string;
  width: string;
  height: string;
  animationDelay: string;
  animationDuration: string;
}

export default function PressListPage() {
  const [posts, setPosts] = useState<PressPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
  const defaultImage = `${baseUrl}/images/logo.png`;
  const defaultImageAlt = "agentVooc Logo";

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setIsLoading(true);
        const response = await apiClient.getPressPosts();
        setPosts(response.pressPosts);
      } catch (err: any) {
        console.error("Error fetching press posts:", err);
        setError(err.message || "Failed to fetch press posts");
      } finally {
        setIsLoading(false);
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

    fetchPosts();
  }, []);

  // Structured data for News
  const newsSchema = {
    "@context": "https://schema.org",
    "@type": "News",
    name: "agentVooc Press",
    description: posts.length > 0 ? posts[0].seoDescription : "Read the latest press releases from agentVooc about our AI automation innovations.",
    url: `${baseUrl}/company/press`,
    publisher: {
      "@type": "Organization",
      name: "agentVooc",
      logo: {
        "@type": "ImageObject",
        url: defaultImage,
        description: defaultImageAlt,
      },
    },
    newsArticle: posts.map((post) => ({
      "@type": "NewsArticle",
      headline: post.title,
      url: `${baseUrl}/company/press/${post.slug.current}`,
      datePublished: post.publishedAt,
      dateModified: post.modifiedAt || post.publishedAt,
      description: post.seoDescription,
      image: {
        "@type": "ImageObject",
        url: post.mainImage || defaultImage,
        description: post.mainImageAlt || defaultImageAlt,
      },
      author: {
        "@type": "Organization",
        name: "agentVooc",
      },
      publisher: {
        "@type": "Organization",
        name: "agentVooc",
        logo: {
          "@type": "ImageObject",
          url: defaultImage,
          description: defaultImageAlt,
        },
      },
      keywords: post.tags?.join(", ") || "",
    })),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-secondary-bg to-agentvooc-primary-bg text-agentvooc-primary flex items-center justify-center">
        <Helmet>
          <title>agentVooc | Loading</title>
          <meta name="description" content="Loading press releases..." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-secondary-bg to-agentvooc-primary-bg text-agentvooc-primary">
        <Helmet>
          <title>Press | agentVooc</title>
          <meta name="description" content="An error occurred while fetching the press releases." />
          <meta name="robots" content="noindex" />
          <link rel="canonical" href={`${baseUrl}/company/press`} />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Press</h1>
          <p>{error}</p>
          <Link to="/company/press" className="text-agentvooc-accent hover:underline">
            Back to Press
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-screen relative overflow-hidden bg-gradient-to-b from-agentvooc-secondary-bg to-agentvooc-primary-bg">
      <Helmet>
        <title>agentVooc | Press</title>
        <meta
          name="description"
          content={
            posts.length > 0
              ? posts[0].seoDescription
              : "Read the latest press releases from agentVooc about our AI automation innovations."
          }
        />
        <meta name="keywords" content={posts[0]?.tags?.join(", ") || "AI automation, agentVooc, press release, technology"} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${baseUrl}/company/press`} />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <meta property="og:title" content="Press | agentVooc" />
        <meta
          property="og:description"
          content={
            posts.length > 0
              ? posts[0].seoDescription
              : "Read the latest press releases from agentVooc about our AI automation innovations."
          }
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${baseUrl}/company/press`} />
        <meta property="og:image" content={posts[0]?.mainImage || defaultImage} />
        <meta property="og:image:alt" content={posts[0]?.mainImageAlt || defaultImageAlt} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Press | agentVooc" />
        <meta
          name="twitter:description"
          content={
            posts.length > 0
              ? posts[0].seoDescription
              : "Read the latest press releases from agentVooc about our AI automation innovations."
          }
        />
        <meta name="twitter:image" content={posts[0]?.mainImage || defaultImage} />
        <meta name="twitter:image:alt" content={posts[0]?.mainImageAlt || defaultImageAlt} />
        <meta name="twitter:site" content="@agentVooc" />
        <script type="application/ld+json">{JSON.stringify(newsSchema)}</script>
      </Helmet>
      <Navbar />
      <div className="absolute inset-0 bg-gradient-to-br from-agentvooc-secondary-bg via-agentvooc-primary-bg to-agentvooc-secondary-accent">
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
        <h1 className="text-3xl font-bold mb-8 text-white">Press</h1>
        {posts.length === 0 ? (
          <div className="text-white">
            <p>No press releases available yet. Check back soon for updates on AI automation innovations!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug.current}
                to={`/company/press/${post.slug.current}`}
                className="group block p-6 bg-agentvooc-primary-bg rounded-lg transition text-white border border-agentvooc-border"
              >
                {post.thumbnailImage && (
                  <img
                    src={post.thumbnailImage}
                    alt={post.mainImageAlt || post.title}
                    loading="lazy"
                    className="w-full h-48 object-cover rounded-t-lg mb-4 hidden md:block"
                  />
                )}
                <h2 className="text-xl font-semibold mb-2">
                  <span className="transition duration-300 ease-in-out group-hover:bg-agentvooc-accent group-active:bg-agentvooc-accent group-hover:text-black group-active:text-black px-2 py-1 rounded-md group-hover:shadow-md">
                    {post.title}
                  </span>
                </h2>
                <p className="text-sm text-gray-300 mb-4 px-2">
                  Published: {new Date(post.publishedAt).toLocaleDateString()}
                </p>
                <p className="px-2">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}