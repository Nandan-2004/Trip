import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const buttonVariants = {
  default: "bg-surface-raised text-primary hover:bg-surface-raised/80",
  primary: "bg-gradient-to-br from-accent-primary to-[#FF8C42] text-white hover:brightness-110 hover:scale-[1.02] shadow-md",
  secondary: "bg-transparent border border-accent-secondary text-accent-secondary hover:bg-accent-secondary/10",
  ghost: "bg-transparent hover:bg-surface-raised text-muted-foreground hover:text-text-primary",
  outline: "border border-border-color bg-transparent hover:bg-surface-raised",
}

const buttonSizes = {
  default: "h-11 px-6 py-2",
  sm: "h-9 px-3",
  lg: "h-14 px-8",
  icon: "h-11 w-11",
}

const Button = React.forwardRef(({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-[10px] text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant] || buttonVariants.default,
        buttonSizes[size] || buttonSizes.default,
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
