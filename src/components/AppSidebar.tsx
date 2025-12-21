import { Home, Settings, LogOut, MapPin, Tag, ChevronDown, Code2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { useTopics } from "@/hooks/useTopics";

const navigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Widget Builder", url: "/dashboard/widgets", icon: Code2 },
];

export function AppSidebar() {
  const { open } = useSidebar();
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const { data: topics, isLoading } = useTopics();

  const isActive = (path: string) => location.pathname === path;
  const isTopicActive = (slug: string) => location.pathname === `/dashboard/topic/${slug}`;
  
  // Check if any topic is active to keep the group open
  const hasActiveTopicRoute = topics?.some((t) => isTopicActive(t.slug));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Brand Section */}
        <div className="flex items-center gap-2 px-3 py-4">
          <img 
            src="/curatr-icon.png" 
            alt="Curatr" 
            className="h-8 w-8 shrink-0"
          />
          {open && (
            <span className="text-lg font-display font-semibold tracking-tight text-sidebar-foreground">
              Curatr
            </span>
          )}
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Topics Section */}
        <SidebarGroup>
          <Collapsible defaultOpen={hasActiveTopicRoute} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center">
                My Topics
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {isLoading ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1 text-sm text-muted-foreground">Loading...</div>
                    </SidebarMenuItem>
                  ) : topics && topics.length > 0 ? (
                    topics.map((topic) => {
                      const Icon = topic.topic_type === "regional" ? MapPin : Tag;
                      return (
                        <SidebarMenuItem key={topic.id}>
                          <SidebarMenuButton asChild isActive={isTopicActive(topic.slug)}>
                            <Link to={`/dashboard/topic/${topic.slug}`}>
                              <Icon className="h-4 w-4" />
                              <span>{topic.name}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })
                  ) : (
                    <SidebarMenuItem>
                      <div className="px-2 py-1 text-sm text-muted-foreground">No topics yet</div>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Admin Section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")}>
                    <Link to="/admin">
                      <Settings className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* User Section */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {open && (
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate text-sidebar-foreground">
                    {user?.email?.split("@")[0]}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={signOut}
                    className="h-auto p-0 justify-start hover:bg-transparent hover:text-destructive"
                  >
                    <LogOut className="h-3 w-3 mr-1" />
                    <span className="text-xs">Sign Out</span>
                  </Button>
                </div>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
