"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FilePlus2, ListChecks, BarChart3, Settings, MountainIcon, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/forms/create', label: 'Create Form', icon: FilePlus2 },
  { href: '/submissions', label: 'Submissions', icon: ListChecks },
  { href: '/reports', label: 'Reports', icon: BarChart3, disabled: true }, // Example disabled
  { href: '/import', label: 'Import Template', icon: UploadCloud, disabled: true },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className="flex items-center justify-between p-4 group-data-[collapsible=icon]:justify-center">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
           <MountainIcon className="h-6 w-6 text-sidebar-primary" /> FormFlow
        </Link>
         <Link href="/dashboard" className="hidden items-center gap-2 font-semibold text-primary-foreground group-data-[collapsible=icon]:flex">
           <MountainIcon className="h-6 w-6 text-sidebar-primary" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                tooltip={item.label}
                disabled={item.disabled}
                aria-disabled={item.disabled}
              >
                <Link href={item.disabled ? "#" : item.href} className={cn(item.disabled && "cursor-not-allowed opacity-50")}>
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
           <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings" disabled>
              <Link href="/settings" className="cursor-not-allowed opacity-50">
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
