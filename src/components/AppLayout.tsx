import { ReactNode } from "react";
import { useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTopics } from "@/hooks/useTopics";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { data: topics } = useTopics();
  
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    const crumbs = [{ label: "Dashboard", path: "/dashboard" }];
    
    if (pathSegments[0] === "dashboard" && pathSegments[1] === "topic" && pathSegments[2]) {
      const topicSlug = pathSegments[2];
      const topic = topics?.find((t) => t.slug === topicSlug);
      if (topic) {
        crumbs.push({ label: topic.name, path: `/dashboard/topic/${topicSlug}` });
      }
    }
    
    return crumbs;
  };
  
  const breadcrumbs = getBreadcrumbs();
  const hasBreadcrumbs = breadcrumbs.length > 1;

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        
        <div className="flex flex-col flex-1 w-full">
          {/* Single unified header bar */}
          <header className="sticky top-0 z-50 flex h-10 items-center gap-3 border-b border-border/30 bg-white dark:bg-sidebar-background px-4 relative">
            <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent" />
            
            {hasBreadcrumbs && (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, index) => (
                    <BreadcrumbItem key={crumb.path}>
                      {index < breadcrumbs.length - 1 ? (
                        <>
                          <BreadcrumbLink asChild>
                            <Link to={crumb.path}>{crumb.label}</Link>
                          </BreadcrumbLink>
                          <BreadcrumbSeparator />
                        </>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            )}
            {/* Brand accent line */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
          </header>

          {/* Main content */}
          <main className="flex-1 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
