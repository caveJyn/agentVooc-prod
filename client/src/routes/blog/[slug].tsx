import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { PortableText, PortableTextComponents } from "@portabletext/react";

interface BlogPost {
  title: string;
  slug: { current: string };
  content?: Array<any>;
  publishedAt: string;
  modifiedAt?: string;
  seoDescription: string;
  excerpt: string;
  mainImage?: string;
  mainImageAlt?: string;
  heroImage?: string;
  heroImageAlt?: string;
  galleryImages?: Array<{ url: string; alt: string }>;
  thumbnailImage?: string;
  mediumImage?: string;
  tags?: string[];
  relatedContent?: Array<{
    _type: "blogPost" | "pressPost" | "productPage";
    title: string;
    slug: { current: string };
    mainImage?: string;
    mainImageAlt?: string;
    excerpt: string;
  }>;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const baseUrl = import.meta.env.SERVER_URL;
  const defaultImage = `${baseUrl}/images/logo.png`;
  const defaultImageAlt = "agentVooc Logo";

  useEffect(() => {
    const fetchPost = async () => {
      if (!slug) return;
      try {
        setIsLoading(true);
        const response = await apiClient.getBlogPostBySlug(slug);
        setPost(response.blogPosts);
      } catch (err: any) {
        console.error(`Error fetching blog post for slug: ${slug}`, err);
        setError(err.message || "Failed to fetch blog post");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPost();
  }, [slug]);


  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);


  // Custom PortableText components for SEO
  const portableTextComponents: PortableTextComponents = {
    block: {
      h1: ({ children }) => <h1 className="text-3xl font-bold mb-4">{children}</h1>,
      h2: ({ children }) => <h2 className="text-2xl font-semibold mb-3">{children}</h2>,
      h3: ({ children }) => <h3 className="text-xl font-semibold mb-2">{children}</h3>,
      normal: ({ children }) => <p className="mb-4">{children}</p>,
    },
    types: {
      image: ({ value }) => (
        <img
          src={value.asset?.url ? `${value.asset.url}?w=800&auto=format` : defaultImage}
          alt={value.alt || "Blog post image"}
          loading="lazy"
          className="w-full h-auto my-4 rounded-lg"
        />
      ),
    },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-agentvooc-secondary-bg to-agentvooc-primary-bg text-agentvooc-primary flex items-center justify-center">
        <Helmet>
          <title>agentVooc | Loading</title>
          <meta name="description" content="Loading blog post..." />
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
          <title>agentVooc | Error</title>
          <meta name="description" content="An error occurred while fetching the blog post." />
          <meta name="robots" content="noindex" />
          <link rel="canonical" href={`${baseUrl}/company/blog`} />
        </Helmet>
        <div className="max-w-6xl mx-auto py-12 px-4">
          <h1 className="text-3xl font-bold mb-4">Error</h1>
          <p>{error}</p>
          <Link to="/company/blog" className="text-agentvooc-accent hover:underline">
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  if (!post) {
    return null; // Should not reach here due to error handling
  }

  // Structured data for BlogPosting
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription,
    datePublished: post.publishedAt,
    dateModified: post.modifiedAt || post.publishedAt,
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
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/company/blog/${post.slug.current}`,
    },
    keywords: post.tags?.join(", ") || "",
    relatedLink: post.relatedContent?.map((item) => ({
      "@type": item._type === "blogPost" ? "BlogPosting" : item._type === "pressPost" ? "NewsArticle" : "WebPage",
      url: `${baseUrl}/company/${item._type === "blogPost" ? "blog" : item._type === "pressPost" ? "press" : "products"}/${item.slug.current}`,
      headline: item.title,
      image: {
        "@type": "ImageObject",
        url: item.mainImage || defaultImage,
        description: item.mainImageAlt || defaultImageAlt,
      },
    })) || [],
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-agentvooc-secondary-bg to-agentvooc-primary-bg text-agentvooc-primary">
      <Helmet>
        <title>{post.title} | agentVooc</title>
        <meta name="description" content={post.seoDescription} />
        <meta name="keywords" content={post.tags?.join(", ") || "AI automation, agentVooc, blog, technology"} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${baseUrl}/company/blog/${post.slug.current}`} />
        <link rel="sitemap" href={`${baseUrl}/sitemap.xml`} type="application/xml" />
        <meta property="og:title" content={`${post.title} | agentVooc`} />
        <meta property="og:description" content={post.seoDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`${baseUrl}/company/blog/${post.slug.current}`} />
        <meta property="og:image" content={post.mainImage || defaultImage} />
        <meta property="og:image:alt" content={post.mainImageAlt || defaultImageAlt} />
        <meta property="og:site_name" content="agentVooc" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${post.title} | agentVooc`} />
        <meta name="twitter:description" content={post.seoDescription} />
        <meta name="twitter:image" content={post.mainImage || defaultImage} />
        <meta name="twitter:image:alt" content={post.mainImageAlt || defaultImageAlt} />
        <meta name="twitter:site" content="@agentVooc" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <div className="max-w-3xl mx-auto py-12 px-4">
        {post.heroImage && (
          <img
            src={post.heroImage}
            alt={post.heroImageAlt || post.title}
            loading="lazy"
            className="w-full h-auto mb-8 rounded-lg"
          />
        )}
        <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
        <p className="text-sm text-gray-500 mb-8">
          Published: {new Date(post.publishedAt).toLocaleDateString()}
          {post.modifiedAt && post.modifiedAt !== post.publishedAt && (
            <> | Updated: {new Date(post.modifiedAt).toLocaleDateString()}</>
          )}
        </p>
        <div className="prose prose-invert max-w-none">
          <PortableText value={post.content} components={portableTextComponents} />
        </div>
        {post.galleryImages && post.galleryImages.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-semibold mb-4">Gallery</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {post.galleryImages.map((image, index) => (
                <img
                  key={index}
                  src={image.url}
                  alt={image.alt}
                  loading="lazy"
                  className="w-full h-auto rounded-lg"
                />
              ))}
            </div>
          </div>
        )}
        {post.relatedContent && post.relatedContent.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-semibold mb-4">Related Content</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {post.relatedContent.slice(0, 3).map((item) => (
                <Link
                  key={`${item._type}-${item.slug.current}`}
                  to={`/${item._type === "blogPost" ? "company/blog" : item._type === "pressPost" ? "company/press" : "product"}/${item.slug.current}`}
                  className="block p-4 bg-agentvooc-primary-bg rounded-lg border border-agentvooc-border text-white hover:bg-agentvooc-accent hover:text-black hover:shadow-lg transition-all duration-300"
                  aria-label={`View ${item._type === "blogPost" ? "blog post" : item._type === "pressPost" ? "press release" : "product"}: ${item.title}`}
                  onClick={() => window.scrollTo(0, 0)}
                >
                  {item.mainImage && (
                    <img
                      src={item.mainImage}
                      alt={item.mainImageAlt || item.title}
                      loading="lazy"
                      className="w-full h-32 object-cover rounded-t-lg mb-2"
                    />
                  )}
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  {item.excerpt && (
                    <p className="text-sm text-gray-300 mb-2 line-clamp-2">{item.excerpt}</p>
                  )}
                  <span className="inline-block px-2 py-1 text-xs font-medium text-white bg-agentvooc-accent rounded-full">
                    {item._type === "blogPost" ? "Blog Post" : item._type === "pressPost" ? "Press Release" : "Product"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}