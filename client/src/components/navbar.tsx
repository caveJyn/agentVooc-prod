import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
// import { ThemeToggle } from "./themeToggle";
import { CardHeader } from "./ui/card";

export default function Navbar() {
  const navigate = useNavigate();

  return (
  <CardHeader className="flex flex-row py-4 px-4 sm:px-8 justify-between items-center sticky top-0 z-50 shadow-agentvooc-glow w-full max-w-full overflow-x-hidden">
    <div
      className="text-2xl sm:text-3xl font-semibold cursor-pointer hover:text-agentvooc-accent transition-all whitespace-nowrap"
      onClick={() => navigate("/")}
    >
      agentVooc <span className="text-agentvooc-accent">.</span>
    </div>
    <ul className="flex gap-3 sm:gap-5">
      {["Home", "Blog", "About"].map((link) => (
        <li key={link}>
          <a
            href={link === "Home" ? "/home" : `/company/${link.toLowerCase()}`}
            className="text-sm sm:text-base footer-link"
          >
            {link}
          </a>
        </li>
      ))}
    </ul>
    {/* <ThemeToggle /> */}
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigate("/auth")}
      aria-label="Sign Up for agentVooc"
    >
      Sign Up
    </Button>
  </CardHeader>
);
}
