import type { IconName } from "@/components/Icon";

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
}

// Desktop header, in the design's order.
export const DESKTOP_NAV: NavItem[] = [
  { label: "Overview", to: "/", icon: "home" },
  { label: "Month", to: "/month", icon: "chart" },
  { label: "Bills", to: "/bills", icon: "bill" },
  { label: "Accounts", to: "/accounts", icon: "wallet" },
  { label: "Categories", to: "/categories", icon: "tag" },
  { label: "Review", to: "/review", icon: "shield" },
  { label: "Settings", to: "/settings", icon: "gear" },
];

// Phone tab bar.
export const PHONE_TABS: NavItem[] = [
  { label: "Home", to: "/", icon: "home" },
  { label: "Activity", to: "/activity", icon: "list" },
  { label: "Month", to: "/month", icon: "chart" },
  { label: "Bills", to: "/bills", icon: "bill" },
  { label: "Review", to: "/review", icon: "shield" },
];
