// /home/kaijin/projects/bots/venv/elizaOS_env/agentVooc-prod/client/src/App.tsx
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import NavSidebar from "./components/nav-sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/toaster";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Chat from "./routes/chat";
import Home from "./routes/home";
import Landing from "./routes/landing";
import Auth from "./routes/auth";
import SuccessPage from "./routes/success";
import CancelPage from "./routes/cancel";
import { ProtectedRoute } from "./components/protected-route";
import { BackgroundWrapper } from "./components/BackgroundWrapper";
import AgentRoute from "./routes/overview";
import Payment from "./routes/payment";
import KnowledgeVault from "./routes/knowledgeVault";
import CreateCharacter from "./components/create-character";
import EditCharacter from "./components/edit-character";
import Settings from "./routes/settings";
import EmailVault from "./routes/emailVault";
import { Helmet, HelmetProvider } from "react-helmet-async";
import LegalDocumentPage from "./routes/legal/[slug]";
import CompanyPage from "./routes/company/[slug]";
import BlogListPage from "./routes/blog/index";
import BlogPostPage from "./routes/blog/[slug]";
import PressListPage from "./routes/press/index";
import PressPostPage from "./routes/press/[slug]";
import ProductListPage from "./routes/product";
import ProductPage from "./routes/product/[slug]";
import Demo from "./routes/demo";
import { useEffect } from "react";
import { Footer } from "./components/landing/footer";
import { FooterProvider } from "./context/footerContext";
import { ThemeToggle } from "./components/themeToggle";
import { Menu } from "lucide-react";
import { useIsMobile } from "./hooks/use-mobile";
import Navbar from "./components/navbar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

// Routes where the AppSidebar should be displayed
const APP_SIDEBAR_ROUTES = [
  "/home",
  "/chat",
  "/settings",
  "/create-character",
  "/edit-character",
  "/email-vault",
  "/knowledge",
];

// Routes where the footer should be displayed
const FOOTER_ROUTES = [
  "/",
  "/company/:slug",
  "/company/blog",
  "/company/blog/:slug",
  "/company/press",
  "/company/press/:slug",
  "/product",
  "/product/:slug",
  "/legal/:slug",
  "/demo",
];

// Routes where the NavSidebar toggle should be displayed on mobile
const NAV_SIDEBAR_ROUTES = [
  "/",
  "/company/:slug",
  "/company/blog",
  "/company/blog/:slug",
  "/company/press",
  "/company/press/:slug",
  "/product",
  "/product/:slug",
  "/legal/:slug",
  "/demo",
];

function AppContent() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const showSidebar = APP_SIDEBAR_ROUTES.some((route) =>
    location.pathname.startsWith(route)
  );
  const showFooter = FOOTER_ROUTES.some(
    (route) =>
      location.pathname === route ||
      (route.includes(":slug") && location.pathname.startsWith(route.split("/:")[0]))
  );
  const showNavSidebar = NAV_SIDEBAR_ROUTES.some(
    (route) =>
      location.pathname === route ||
      (route.includes(":slug") && location.pathname.startsWith(route.split("/:")[0]))
  );

  useEffect(() => {
    if (!window.twq) {
      window.twq = function (...args: any[]) {
        window.twq.exe ? window.twq.exe(...args) : window.twq.queue.push(args);
      } as any;
      window.twq.version = "1.1";
      window.twq.queue = [];
    }
    window.twq("config", "q5y7y");
    window.twq("event", "PageView");
  }, [location]);

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <Helmet>
          <script
            async
            src="https://static.ads-twitter.com/uwt.js"
            type="text/javascript"
          ></script>
        </Helmet>
        {showSidebar && <AppSidebar />}
        {showNavSidebar && isMobile && <NavSidebar />}
        <div
          className={`flex flex-1 flex-col gap-4 size-full w-full ${
            showSidebar ? "max-w-[90%] mx-auto px-4 md:px-6 mt-9" : "max-w-[100%]"
          } bg-transparent`}
        >
          {!showSidebar && !isMobile && <Navbar />}
          {showSidebar && (
            <div className="flex items-center p-4 gap-2">
              <SidebarTrigger className="text-agentvooc-primary hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent" />
              <ThemeToggle />
            </div>
          )}
          {showNavSidebar && isMobile && (
            <div className="sticky top-0 z-50 flex items-center justify-between p-4 bg-agentvooc-secondary-bg shadow-agentvooc-glow">
              <div
                className="text-2xl font-semibold cursor-pointer hover:text-agentvooc-accent transition-all whitespace-nowrap"
                onClick={() => window.location.href = "/"}
              >
                agentVooc <span className="text-agentvooc-accent">.</span>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <SidebarTrigger className="text-agentvooc-primary hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle Navigation Sidebar</span>
                </SidebarTrigger>
              </div>
            </div>
          )}
          {showSidebar && <SidebarInset />}
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/email" element={<Auth />} />
            <Route path="/auth/phantom" element={<Auth />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/cancel" element={<CancelPage />} />
            <Route path="/auth/callback/google" element={<Auth />} />
            <Route
              path="/knowledge/:agentId"
              element={
                <ProtectedRoute>
                  <KnowledgeVault />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email-vault/:agentId"
              element={
                <ProtectedRoute>
                  <EmailVault />
                </ProtectedRoute>
              }
            />
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/:agentId"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/:agentId"
              element={
                <ProtectedRoute>
                  <AgentRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-character"
              element={
                <ProtectedRoute>
                  <CreateCharacter setError={() => {}} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/edit-character/:id"
              element={
                <ProtectedRoute>
                  <EditCharacter setError={() => {}} />
                </ProtectedRoute>
              }
            />
            <Route path="/legal/:slug" element={<LegalDocumentPage />} />
            <Route path="/company/:slug" element={<CompanyPage />} />
            <Route path="/company/blog" element={<BlogListPage />} />
            <Route path="/company/blog/:slug" element={<BlogPostPage />} />
            <Route path="/company/press" element={<PressListPage />} />
            <Route path="/company/press/:slug" element={<PressPostPage />} />
            <Route path="/product" element={<ProductListPage />} />
            <Route path="/product/:slug" element={<ProductPage />} />
            <Route path="/demo" element={<Demo />} />
            <Route
              path="*"
              element={<div>No route matched: {location.pathname}</div>}
            />
          </Routes>
          {showFooter && <Footer />}
        </div>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <BackgroundWrapper>
          <BrowserRouter>
            <FooterProvider>
              <AppContent />
            </FooterProvider>
          </BrowserRouter>
        </BackgroundWrapper>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

export default App;