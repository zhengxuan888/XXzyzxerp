import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-amber-600 bg-amber-600 text-white hover:-translate-y-0.5 hover:border-amber-700 hover:bg-amber-700 hover:shadow-md",
        secondary: "border border-slate-200 bg-slate-950 text-white hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md",
        outline: "border border-amber-300 bg-white text-amber-800 hover:border-amber-400 hover:bg-amber-50",
        ghost: "border border-transparent bg-transparent text-slate-600 shadow-none hover:bg-slate-100 hover:text-slate-950",
        success: "border border-emerald-600 bg-emerald-600 text-white hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md",
        warning: "border border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100",
        destructive: "border border-rose-600 bg-rose-600 text-white hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md focus-visible:ring-rose-200",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 px-6",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
