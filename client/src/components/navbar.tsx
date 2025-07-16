import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();

  return (
    <nav className="bg-agentvooc-primary-bg border-b border-agentvooc-border py-4 px-4 sm:px-8 flex justify-between items-center sticky top-0 z-50 shadow-agentvooc-glow w-full max-w-full overflow-x-hidden">
      <div
        className="text-2xl sm:text-3xl font-semibold text-agentvooc-primary cursor-pointer hover:text-agentvooc-accent transition-all whitespace-nowrap"
        onClick={() => navigate("/")}
      >
        agentVooc <span className="text-agentvooc-accent">.</span>
      </div>
      <ul className="flex gap-3 sm:gap-5">
        {["Home", "Blog", "About"].map((link) => (
          <li key={link}>
            <a
              href={link === "Home" ? "/home" : `/company/${link.toLowerCase()}`}
              className="text-sm sm:text-base text-agentvooc-primary hover:text-agentvooc-accent transition-colors footer-link"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        className="text-xs sm:text-sm text-agentvooc-accent border-agentvooc-accent/30 hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg shadow-agentvooc-glow animate-glow-pulse rounded-full px-3 sm:px-4"
        onClick={() => navigate("/auth")}
        aria-label="Sign Up for agentVooc"
      >
        Sign Up
      </Button>
    </nav>
  );
}
