"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AdminSession {
  id: string; // admin_id from admins table
  user_id?: string; // user_id from users table (if logged in via users table)
  email: string;
  company_name: string | null;
  role?: string | null;
  permissions?: Record<string, boolean>;
  isOwner?: boolean;
}

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshPermissions = useCallback(async (currentSession: AdminSession) => {
    if (!currentSession.user_id) {
      // Legacy admin login - has full access
      setSession({
        ...currentSession,
        isOwner: true,
        permissions: {},
      });
      return;
    }

    const supabase = createClient();
    
    // Fetch user with role and check if owner
    const { data: user } = await supabase
      .from("users")
      .select(`
        id,
        is_owner,
        role_id,
        role:roles(id, name, permissions)
      `)
      .eq("id", currentSession.user_id)
      .single();

    if (user) {
      const role = user.role as { id: string; name: string; permissions: Record<string, boolean> } | null;
      
      // Fetch user permission overrides
      const { data: overrides } = await supabase
        .from("user_permission_overrides")
        .select("permission_key, granted")
        .eq("user_id", currentSession.user_id);

      const overrideMap: Record<string, boolean> = {};
      overrides?.forEach((o) => {
        overrideMap[o.permission_key] = o.granted;
      });

      // Merge role permissions with overrides
      const mergedPermissions = { ...(role?.permissions || {}), ...overrideMap };

      setSession({
        ...currentSession,
        role: role?.name || null,
        permissions: mergedPermissions,
        isOwner: user.is_owner,
      });
    }
  }, []);

  useEffect(() => {
    const sessionStr = localStorage.getItem("admin_session");
    if (sessionStr) {
      try {
        const parsed = JSON.parse(sessionStr);
        if (parsed.id && parsed.email) {
          // If session has user_id, fetch fresh permissions
          if (parsed.user_id) {
            refreshPermissions(parsed);
          } else {
            // Legacy admin - full access
            setSession({
              ...parsed,
              isOwner: true,
              permissions: {},
            });
          }
        }
      } catch {
        // Invalid session
      }
    }
    setLoading(false);
  }, [refreshPermissions]);

  // Helper function to check permission
  const hasPermission = useCallback((permissionKey: string): boolean => {
    if (!session) return false;
    
    // Owner or legacy admin has all permissions
    if (session.isOwner || !session.user_id) return true;
    
    // Check permissions map
    return session.permissions?.[permissionKey] === true;
  }, [session]);

  // Helper to check if user can access a module
  const canAccess = useCallback((module: string): boolean => {
    if (!session) return false;
    if (session.isOwner || !session.user_id) return true;

    const modulePrefix = module.toLowerCase().replace(/\s+/g, "_");
    
    // Check if any permission for this module is granted
    return Object.entries(session.permissions || {}).some(
      ([key, value]) => key.startsWith(`${modulePrefix}:`) && value
    );
  }, [session]);

  return { session, loading, hasPermission, canAccess, refreshPermissions };
}
