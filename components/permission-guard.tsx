"use client";

import React from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PermissionGuardProps {
  children: React.ReactNode;
  userId: string | undefined;
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  showAccessDenied?: boolean;
}

/**
 * Component that conditionally renders children based on user permissions.
 * 
 * @param permission - Single permission key to check
 * @param permissions - Multiple permission keys to check
 * @param requireAll - If true, all permissions must be granted. If false, any permission grants access.
 * @param fallback - Custom fallback to show when access is denied
 * @param showAccessDenied - If true, shows an access denied message instead of hiding content
 */
export function PermissionGuard({
  children,
  userId,
  permission,
  permissions,
  requireAll = false,
  fallback,
  showAccessDenied = false,
}: PermissionGuardProps) {
  const { loading, hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions(userId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions) 
      : hasAnyPermission(permissions);
  } else {
    // No permission specified, allow access
    hasAccess = true;
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showAccessDenied) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg mb-1">Access Denied</h3>
          <p className="text-muted-foreground mb-4">
            You don&apos;t have permission to access this content.
          </p>
          <Link href="/admin">
            <Button variant="outline" className="bg-transparent">
              Go to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return null;
}

/**
 * Hook-based permission check for conditional rendering in components
 */
export function usePermissionCheck(
  userId: string | undefined,
  permission?: string,
  permissions?: string[],
  requireAll = false
): { loading: boolean; hasAccess: boolean } {
  const { loading, hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions(userId);

  let hasAccess = false;

  if (!loading) {
    if (permission) {
      hasAccess = hasPermission(permission);
    } else if (permissions) {
      hasAccess = requireAll 
        ? hasAllPermissions(permissions) 
        : hasAnyPermission(permissions);
    } else {
      hasAccess = true;
    }
  }

  return { loading, hasAccess };
}
