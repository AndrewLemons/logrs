import { A, useLocation } from "@solidjs/router";
import { Radio, BookOpen, User, LayoutTemplate, Settings, Zap } from "lucide-solid";

export default function Sidebar() {
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path;

  return (
    <nav class="app-sidebar">
      <div class="sidebar-drag-region" data-tauri-drag-region />
      <div class="sidebar-logo" data-tauri-drag-region><Radio size={18} /> LogRS</div>

      <div class="sidebar-nav">
        <A href="/" class={isActive("/") ? "active" : ""} end>
          <Zap size={15} /> Workspace
        </A>
        <A href="/logbooks" class={isActive("/logbooks") ? "active" : ""}>
          <BookOpen size={15} /> Logbooks
        </A>
        <A href="/profiles" class={isActive("/profiles") ? "active" : ""}>
          <User size={15} /> Profiles
        </A>
        <A href="/templates" class={isActive("/templates") ? "active" : ""}>
          <LayoutTemplate size={15} /> Templates
        </A>
        <A href="/settings" class={isActive("/settings") ? "active" : ""}>
          <Settings size={15} /> Settings
        </A>
      </div>
    </nav>
  );
}
