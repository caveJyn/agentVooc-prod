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
  const positions = [...Array(600)].map(() => {
    // Distribute stars along an elliptical path
    const angle = Math.random() * 2 * Math.PI; // Random angle (0 to 2π)
    // Semi-major (a) and semi-minor (b) axes for ellipse
    const a = window.innerWidth * 2.8 * 0.5; // 50% of 280vw (70% of screen width)
    const b = window.innerHeight * 2.8 * 0.5; // 50% of 280vh (70% of screen height)
    const radiusScale = Math.random() * 0.8 + 0.4; // Scale radius between 40% and 120% for depth

    // Elliptical path: x = a * cos(θ), y = b * sin(θ)
    const x = a * Math.cos(angle) * radiusScale;
    const y = b * Math.sin(angle) * radiusScale;

    // Galaxy center at 50% of 280vw/vh container
    const galaxyCenterX = window.innerWidth * 2.8 * 0.5; // 50% of 280vw
    const galaxyCenterY = window.innerHeight * 2.8 * 0.5; // 50% of 280vh

    // Convert to percentages relative to galaxy-container
    const containerWidth = window.innerWidth * 2.8; // 280vw
    const containerHeight = window.innerHeight * 2.8; // 280vh
    const left = ((galaxyCenterX + x) / containerWidth) * 100;
    const top = ((galaxyCenterY + y) / containerHeight) * 100;

    return {
      top: `${top}%`,
      left: `${left}%`,
      width: `${Math.random() * 4 + 2}px`, // 2-6px
      height: `${Math.random() * 4 + 2}px`,
      animationDelay: `${Math.random() * 4}s`,
      animationDuration: `${Math.random() * 5 + 3}s`,
    };
  });
  setStarPositions(positions);
}, []);

  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden bg-cover bg-center bg-no-repeat hero-container">
      {/* Background Gradient and Overlay */}
      <div
        className={`absolute inset-0 ${
          backgroundImage
            ? "lg:bg-gradient-to-br lg:from-agentvo dzieoc-secondary-bg lg:via-agentvooc-primary-bg lg:to-agentvooc-secondary-accent"
            : "bg-gradient-to-br from-agentvooc-secondary-bg via-agentvooc-primary-bg to-agentvooc-secondary-accent"
        }`}
      >
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Galaxy Container for Stars and Pulses */}
      <div className="galaxy-container">
        {/* Pulse Effects (Primary and Secondary) */}
        <div className="absolute top-25% left-25% pointer-events-none z-0">
          <div
            className="w-96 h-96 bg-agentvooc-accent rounded-full pulse"
            style={{ animationDelay: "0s" }}
          />
          <div
            className="w-80 h-80 bg-agentvooc-accent rounded-full pulse pulse-secondary"
            style={{ animationDelay: "-2s" }}
          />
        </div>

        {/* Particle Effect (Stars) */}
        <div className="absolute inset-0 pointer-events-none">
          {starPositions.map((position, index) => (
            <div
              key={index}
              className="star"
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
      </div>

      {/* Content (unchanged) */}
      <div className="relative z-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center lg:flex-row lg:items-center">
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
          <NavLink to="https://agentvooc.com/demo">
            <Button
              variant="default"
              size="lg"
              className="animate-glow-pulse"
              style={{ animationDelay: "0.4s" }}
            >
              {primaryCtaText}
            </Button>
          </NavLink>
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
                [3D GLB Model placeholder: {heroSection.mascotModel.asset.url}]
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