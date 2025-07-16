import { Button } from "@/components/ui/button";

interface ImageVariants {
  main: string;
  thumbnail: string;
  medium: string;
}

interface Feature {
  title: string;
  description: string;
  icon?: ImageVariants;
}

interface FeaturesSectionProps {
  featuresSection: {
    heading: string;
    features: Feature[];
    ctaText: string;
  };
}

export const FeaturesSection = ({ featuresSection }: FeaturesSectionProps) => {
  const heading = featuresSection.heading || "Why Choose agentVooc?";
  const features =
    featuresSection.features.length > 0
      ? featuresSection.features
      : [
          {
            title: "Intelligent AI Agents",
            description: "Automate tasks with smart AI agents that learn and adapt.",
            icon: null,
          },
          {
            title: "Seamless Automation",
            description: "Streamline workflows with one-click automation.",
            icon: null,
          },
          {
            title: "Real-Time Insights",
            description: "Get actionable insights to make smarter decisions.",
            icon: null,
          },
        ];
  const ctaText = featuresSection.ctaText || "Explore All Features";

  return (
    <section className="py-16 px-4 bg-agentvooc-primary-bg-dark animate-fade-in" aria-label="Features">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-4xl font-bold mb-8 text-agentvooc-primary">{heading}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {features.map((feature, index) => (
            <article
              key={index}
              className="p-6 bg-agentvooc-secondary-accent rounded-lg shadow-agentvooc-glow hover:bg-agentvooc-secondary-accent/80 hover:shadow-lg hover:scale-105 transition-all duration-300"
              aria-labelledby={`feature-${index}-title`}
            >
              {feature.icon && feature.icon.main ? (
                <img
                  src={feature.icon.main}
                  alt={feature.title}
                  className="w-12 h-12 mx-auto mb-4 object-contain"
                  onError={(e) => {
                    console.error(`Failed to load feature icon for ${feature.title}:`, feature.icon?.main);
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-12 h-12 mx-auto mb-4 bg-agentvooc-primary-bg rounded-full flex items-center justify-center">
                  <span className="text-agentvooc-accent text-lg">
                    {feature.title.charAt(0)}
                  </span>
                </div>
              )}
              <h3 id={`feature-${index}-title`} className="text-xl font-semibold text-agentvooc-primary mb-2">
                {feature.title}
              </h3>
              <p className="text-agentvooc-secondary">{feature.description}</p>
            </article>
          ))}
        </div>
        <Button
          className="mt-8 bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-button-bg-hover hover:text-agentvooc-accent-dark shadow-agentvooc-glow animate-glow-pulse rounded-full px-8 py-4 text-lg transform hover:scale-105 transition-all"
          aria-label="Explore All Features"
        >
          {ctaText}
        </Button>
      </div>
    </section>
  );
};