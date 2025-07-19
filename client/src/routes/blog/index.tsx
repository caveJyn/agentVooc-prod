import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import Navbar from "@/components/navbar";

interface BlogPost {
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

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  const baseUrl = import.meta.env.SERVER_URL;
  const defaultImage = `${baseUrl}/images/logo.png`;
  const defaultImageAlt = "agentVooc Logo";

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setIsLoading(true);
        const response = await apiClient.getBlogPosts();
        setPosts(response.blogPosts);
      } catch (err: any) {
        console.error("Error fetching blog posts:", err);
        setError(err.message || "Failed to fetch blog posts");
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

  // Structured data for Blog
  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "agentVooc Blog",
    description: posts.length > 0 ? posts[0].seoDescription : "Explore the latest blog posts from agentVooc about AI automation and technology.",
    url: `${baseUrl}/company/blog`,
    publisher: {
      "@type": "Organization",
      name: "agentVooc",
      logo: {
        "@type": "ImageObject",
        url: defaultImage,
        description: defaultImageAlt,
      },
    },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${baseUrl}/company/blog/${post.slug.current}`,
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
          <meta name="description" content="Loading blog posts..." />
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
          <title>Blog | agentVooc</title>
          <meta name="description" content="An error occurred while fetching the blog posts." />
          <meta name="robots" content="noindex" />
          <link rel="canonical" href={`${baseUrl}/company/blog`} />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Blog</h1>
          <p>{error}</p>
          <Link to="/company/blog" className="text-agentvooc-accent hover:underline">
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-screen relative overflow-hidden bg-gradient-to-b from-agentvooc-secondary-bg to-agentvooc-primary-bg">
      <Helmet>
        <title>agentVooc | Blog</title>
        <meta
          name="description"
          content={
            posts.length > 0
              ? posts[0].seoDescription
              : "Explore the latest blog posts from agentVooc about AI automation and technology."
          }
        />
        <meta name="keywords" content={posts[0]?.tags?.join(", ") || "AI automation, agentVooc, blog, technology"} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${baseUrl}/company/blog`} />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <meta property="og:title" content="Blog | agentVooc" />
        <meta
          property="og:description"
          content={
            posts.length > 0
              ? posts[0].seoDescription
              : "Explore the latest blog posts from agentVooc about AI automation and technology."
          }
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${baseUrl}/company/blog`} />
        <meta property="og:image" content={posts[0]?.mainImage || defaultImage} />
        <meta property="og:image:alt" content={posts[0]?.mainImageAlt || defaultImageAlt} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Blog | agentVooc" />
        <meta
          name="twitter:description"
          content={
            posts.length > 0
              ? posts[0].seoDescription
              : "Explore the latest blog posts from agentVooc about AI automation and technology."
          }
        />
        <meta name="twitter:image" content={posts[0]?.mainImage || defaultImage} />
        <meta name="twitter:image:alt" content={posts[0]?.mainImageAlt || defaultImageAlt} />
        <meta name="twitter:site" content="@agentVooc" />
        <script type="application/ld+json">{JSON.stringify(blogSchema)}</script>
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
        <h1 className="text-3xl font-bold mb-8 text-white">Blog</h1>
        {posts.length === 0 ? (
          <div className="text-white">
            <p>No blog posts available yet. Check back soon for insights on AI automation and technology!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug.current}
                to={`/company/blog/${post.slug.current}`}
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