import { cn } from "@/lib/utils";

interface SectionLabelProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function SectionLabel({ className, children, ...props }: SectionLabelProps) {
  return (
    <h3
      className={cn(
        "text-sm font-medium text-muted-foreground mb-3",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}
