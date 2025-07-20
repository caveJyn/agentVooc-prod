// /home/kaijin/projects/bots/venv/elizaOS_env/agentVooc-prod/client/src/components/nav-sidebar.tsx
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./themeToggle";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

export default function NavSidebar() {
  const navigate = useNavigate();

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="offcanvas"
      className="bg-agentvooc-secondary-bg text-agentvooc-primary border-r border-agentvooc-border shadow-agentvooc-glow"
    >
      <SidebarHeader className="flex items-center justify-between p-4">
        <div
          className="text-2xl font-semibold cursor-pointer hover:text-agentvooc-accent transition-all whitespace-nowrap"
          onClick={() => navigate("/")}
        >
          agentVooc <span className="text-agentvooc-accent">.</span>
        </div>
        <SidebarTrigger className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle Navigation Sidebar</span>
        </SidebarTrigger>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {["Home", "Blog", "About"].map((link) => (
            <SidebarMenuItem key={link}>
              <SidebarMenuButton
                asChild
                className="text-agentvooc-navbar-footer hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent"
              >
                <a
                  href={link === "Home" ? "/home" : `/company/${link.toLowerCase()}`}
                >
                  {link}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent">
              <ThemeToggle />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/auth")}
                className="w-full bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-button-bg-hover hover:text-agentvooc-accent-dark border-agentvooc-border"
                aria-label="Sign Up for agentVooc"
              >
                Sign Up
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}