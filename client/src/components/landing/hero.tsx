import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

interface ImageVariants {
  main: string;
  thumbnail: string;
  medium: string;
}

interface HeroSection {
  title: string;
  subtitle: string;
  primaryCtaText: string;
  secondaryCtaText?: string;
  trustSignal?: string;
  backgroundImage?: ImageVariants;
  mascotModel?: { asset: { _id: string; url: string } };
}

interface HeroProps {
  heroSection: HeroSection;
}

interface StarPosition {
  top: string;
  left: string;
  width: string;
  height: string;
  animationDelay: string;
  animationDuration: string;
}

export const Hero = ({ heroSection }: HeroProps) => {
  const title = heroSection.title || "Welcome to the Future with agentVooc";
  const subtitle =
    heroSection.subtitle ||
    "Empower your decisions with intelligent AI agents and automation.";
  const primaryCtaText = heroSection.primaryCtaText || "Get Started";
  const backgroundImage = heroSection.backgroundImage;

  const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  useEffect(() => {
    const positions = [...Array(20)].map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      width: `${Math.random() * 4 + 2}px`,
      height: `${Math.random() * 4 + 2}px`,
      animationDelay: `${Math.random() * 5}s`,
      animationDuration: `${Math.random() * 3 + 2}s`,
    }));
    setStarPositions(positions);
  }, []);

  return (
  <section className="min-h-screen flex items-center justify-center relative overflow-hidden bg-cover bg-center bg-no-repeat">
    {/* Background Gradient and Overlay */}
    <div
      className={`absolute inset-0 ${
        backgroundImage
          ? "lg:bg-gradient-to-br lg:from-agentvooc-secondary-bg lg:via-agentvooc-primary-bg lg:to-agentvooc-secondary-accent"
          : "bg-gradient-to-br from-agentvooc-secondary-bg via-agentvooc-primary-bg to-agentvooc-secondary-accent"
      }`}
    >
      <div className="absolute inset-0 bg-black/60" />
    </div>

    {/* Pulse Effect */}
      <div className="absolute -top-40 -right-32 opacity-5 pointer-events-none z-0">
        <div className="w-96 h-96 bg-agentvooc-accent rounded-full blur-3xl animate-pulse" />
      </div>

    {/* Particle Effect (Stars) */}
    <div className="absolute inset-0 pointer-events-none">
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
            filter: backgroundImage?.medium ? "brightness(150%)" : undefined,
          }}
        />
      ))}
    </div>

    {/* Content */}
    <div className="relative z-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center lg:flex-row lg:items-center">
      {/* Left Half: Text, CTAs, Trust Signals */}
      <div className="w-full lg:w-1/2 text-center lg:text-left lg:pr-4 mb-8 lg:mb-0">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 animate-fade-in"
          style={{
            background: "linear-gradient(to right, hsl(var(--agentvooc-text-hero-title)), hsl(var(--agentvooc-accent)))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animationDelay: "0.0s",
            lineHeight: "1.1",
            paddingBottom: "0.2em",
          }}
        >
          {title}<span>.</span>
        </h1>
        <h2
          className="text-base sm:text-lg md:text-xl lg:text-2xl max-w-xl mx-auto lg:mx-0 mb-6 animate-fade-in"
          style={{ animationDelay: "0.2s" }}
        >
          {subtitle}
        </h2>

        {/* Primary CTA */}
        <NavLink to="https://agentvooc.com/company/blog/how-it-works">
          <Button
            variant="default"
            size="lg"
            className="animate-glow-pulse"
            style={{ animationDelay: "0.4s" }}
          >
            {primaryCtaText}
          </Button>
        </NavLink>

        {/* Trust Signals and Metrics */}
        <div
          className="mt-8 flex flex-wrap justify-center lg:justify-start gap-6 sm:gap-8 animate-fade-in"
          style={{ animationDelay: "0.6s" }}
        >
          <div className="text-agentvooc-accent text-sm sm:text-base">
            <span className="font-bold text-lg">agentVooc</span> | ElizaOS
          </div>
          <div className="text-agentvooc-accent text-sm sm:text-base">
            <span>Open-source</span> | <span className="font-bold text-lg">Framework</span>
          </div>
        </div>
      </div>

      {/* Right Half: Image or 3D GLB File */}
      <div className="w-full lg:w-1/2 flex items-center justify-center">
        {backgroundImage ? (
          <picture>
            <source
              media="(max-width: 640px)"
              srcSet={backgroundImage.thumbnail}
              width="300"
              height="200"
            />
            <source
              media="(max-width: 1024px)"
              srcSet={backgroundImage.medium}
              width="600"
              height="400"
            />
            <source
              media="(min-width: 1025px)"
              srcSet={backgroundImage.main}
              width="998"
              height="1200"
            />
            <img
              src={backgroundImage.medium}
              alt="Hero Image"
              className="w-full max-w-sm sm:max-w-md lg:max-w-lg h-auto object-cover rounded-lg shadow-agentvooc-glow"
              onError={(e) => {
                console.error("Failed to load hero image:", backgroundImage);
                e.currentTarget.style.display = "none";
              }}
            />
          </picture>
        ) : heroSection.mascotModel?.asset?.url ? (
          <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg h-64 sm:h-80 lg:h-96 flex items-center justify-center">
            <p className="text-agentvooc-secondary text-base sm:text-lg">
              [3D GLB Model Placeholder: {heroSection.mascotModel.asset.url}]
            </p>
          </div>
        ) : (
          <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg h-64 sm:h-80 lg:h-96 bg-agentvooc-secondary-accent/20 rounded-lg flex items-center justify-center shadow-agentvooc-glow">
            <p className="text-agentvooc-secondary text-base sm:text-lg">
              [Placeholder for Image or 3D GLB File]
            </p>
          </div>
        )}
      </div>
    </div>
  </section>
);
};
