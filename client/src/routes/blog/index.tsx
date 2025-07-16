import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { apiClient } from "@/lib/api";
import Navbar from "@/components/navbar";

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
  const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  const baseUrl = import.meta.env.SERVER_URL;
  const defaultImage = `${baseUrl}/images/logo.png`;

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await apiClient.getBlogPosts();
        setPosts(response.blogPosts);
      } catch (err: any) {
        console.error("Error fetching blog posts:", err);
        setError(err.message || "Failed to fetch blog posts");
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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-primary-bg to-agentvooc-primary-bg-dark text-agentvooc-primary">
        <Helmet>
          <title>Blog | agentVooc</title>
          <meta name="description" content="An error occurred while fetching the blog posts." />
          <meta name="robots" content="noindex" />
        </Helmet>
        <Navbar />
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Blog</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="min-h-screen relative overflow-hidden"
      style={
        posts[0]?.mainImage
          ? {
              backgroundImage: `url(${posts[0]?.mainImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <Helmet>
        <title>agentVooc | Blog</title>
        <meta name="description" content="Explore the latest blog posts from agentVooc about AI automation and technology." />
        <meta name="keywords" content="AI automation, agentVooc, blog, technology" />
        <meta name="robots" content="index, follow" />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <meta property="og:title" content="Blog | agentVooc" />
        <meta property="og:description" content="Explore the latest blog posts from agentVooc about AI automation and technology." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${baseUrl}/company/blog`} />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Blog | agentVooc" />
        <meta name="twitter:description" content="Explore the latest blog posts from agentVooc about AI automation and technology." />
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
        <h1 className="text-3xl font-bold mb-8 text-white">Blog</h1>
        {posts.length === 0 ? (
          <p className="text-white">No blog posts available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug.current}
                to={`/company/blog/${post.slug.current}`}
                className="block p-6 bg-agentvooc-secondary-bg rounded-lg hover:bg-agentvooc-accent transition text-white"
              >
                {post.mainImage && (
                  <img
                    src={post.mainImage}
                    alt={post.title}
                    className="w-full h-48 object-cover rounded-t-lg mb-4 hidden md:block"
                  />
                )}
                <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
                <p className="text-sm text-gray-300 mb-4">
                  Published: {new Date(post.publishedAt).toLocaleDateString()}
                </p>
                <p>{post.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}