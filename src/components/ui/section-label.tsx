import { cn } from "@/lib/utils";

interface SectionLabelProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function SectionLabel({ className, children, ...props }: SectionLabelProps) {
  return (
    <h3
      className={cn(
        "text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}
