import {
  FileText,
  GitCompare,
  Images,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Settings,
  Telescope,
  TrendingUp,
  Users,
} from "lucide-react";
import type { NavIcon } from "@/lib/app-nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  summary: LayoutDashboard,
  tracking: ListChecks,
  find: Telescope,
  competitors: Users,
  reviews: MessageSquare,
  trends: TrendingUp,
  listing: FileText,
  creatives: Images,
  changes: GitCompare,
  settings: Settings,
};

export function NavIconGlyph({ icon }: { icon: NavIcon }) {
  const Icon = ICONS[icon];
  return <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />;
}
