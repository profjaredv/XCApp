import * as React from "react"
import { TabsList } from "./tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { cn } from "@/lib/utils"

interface TabsTriggerLikeProps {
  value: string
  disabled?: boolean
  children?: React.ReactNode
}

// Pulls the visible label out of a <TabsTrigger>'s children, skipping any
// icon elements (their own children are empty, so they contribute nothing)
// so an icon+text trigger like VDOTCalculator's still gets a clean text
// option in the mobile dropdown.
function extractLabel(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractLabel).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractLabel(node.props.children)
  }
  return ""
}

// Drop-in replacement for <TabsList> that swaps to a full-width <Select>
// below the md breakpoint instead of a horizontal tab row. Long or numerous
// tab labels are what crowd a phone screen — a dropdown always shows the
// current tab's full label and keeps every tab one tap away, with no
// scrolling or icon-only guessing required. Desktop is unchanged: the
// normal TabsList, icons and all, for screens that already have them
// (e.g. VDOTCalculator).
//
// Usage is a mechanical swap — same children (<TabsTrigger>s) as a plain
// TabsList, just with the same value/onValueChange already passed to the
// enclosing <Tabs> repeated here (Radix's Tabs.Root doesn't expose a public
// way to read the controlled value back out from a descendant).
export function ResponsiveTabsList({
  value,
  onValueChange,
  children,
  className,
  ...props
}: React.ComponentProps<typeof TabsList> & {
  value: string
  onValueChange: (value: string) => void
}) {
  const options = React.Children.toArray(children)
    .filter((child): child is React.ReactElement<TabsTriggerLikeProps> => React.isValidElement(child))
    .map((child) => ({
      value: child.props.value,
      label: extractLabel(child.props.children).trim(),
      disabled: child.props.disabled,
    }))

  return (
    <>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full md:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TabsList className={cn("hidden md:inline-flex", className)} {...props}>
        {children}
      </TabsList>
    </>
  )
}
