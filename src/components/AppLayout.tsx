import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        
        <div className="flex flex-col flex-1 w-full">
          {/* Global header with brand and trigger - always visible */}
          <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b bg-card px-4 shadow-sm">
            <SidebarTrigger className="text-foreground hover:bg-accent" />
            <img 
              src="/curatr-icon.png" 
              alt="Curatr" 
              className="h-8 w-8"
            />
            <span className="text-lg font-semibold text-foreground">Curatr</span>
          </header>

          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
