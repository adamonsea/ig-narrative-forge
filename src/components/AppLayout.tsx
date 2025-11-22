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
  
  // Parse breadcrumbs from current route
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    const crumbs = [{ label: "Dashboard", path: "/dashboard" }];
    
    // Check if we're in a topic route
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

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        
        <div className="flex flex-col flex-1 w-full">
          {/* Global header with brand and trigger - always visible */}
          <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-sidebar-border bg-white dark:bg-sidebar-background px-4 shadow-sm">
            <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent" />
            <img 
              src="/curatr-icon.png" 
              alt="Curatr" 
              className="h-8 w-8"
            />
            <span className="text-lg font-semibold text-sidebar-foreground">Curatr</span>
          </header>

          {/* Breadcrumb navigation */}
          {breadcrumbs.length > 1 && (
            <div className="border-b border-sidebar-border bg-white dark:bg-sidebar-background px-4 py-2">
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
            </div>
          )}

          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
