"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface UserPermissions {
  rolePermissions: Record<string, boolean>;
  overrides: Record<string, boolean>;
  roleId: string | null;
  roleName: string | null;
  isOwner: boolean;
}

interface UsePermissionsResult {
  loading: boolean;
  permissions: UserPermissions | null;
  hasPermission: (permissionKey: string) => boolean;
  hasAnyPermission: (permissionKeys: string[]) => boolean;
  hasAllPermissions: (permissionKeys: string[]) => boolean;
  canAccess: (module: string) => boolean;
  refresh: () => Promise<void>;
}

export function usePermissions(userId: string | undefined): UsePermissionsResult {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Fetch user with role
    const { data: user } = await supabase
      .from("users")
      .select(`
        id,
        is_owner,
        role_id,
        role:roles(id, name, permissions)
      `)
      .eq("id", userId)
      .single();

    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch user permission overrides
    const { data: overrides } = await supabase
      .from("user_permission_overrides")
      .select("permission_key, granted")
      .eq("user_id", userId);

    const role = user.role as { id: string; name: string; permissions: Record<string, boolean> } | null;
    
    const overrideMap: Record<string, boolean> = {};
    overrides?.forEach((o) => {
      overrideMap[o.permission_key] = o.granted;
    });

    setPermissions({
      rolePermissions: role?.permissions || {},
      overrides: overrideMap,
      roleId: user.role_id,
      roleName: role?.name || null,
      isOwner: user.is_owner,
    });

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Check if user has a specific permission
  const hasPermission = useCallback((permissionKey: string): boolean => {
    if (!permissions) return false;
    
    // Owner has all permissions
    if (permissions.isOwner) return true;
    
    // Check for explicit override first
    if (permissionKey in permissions.overrides) {
      return permissions.overrides[permissionKey];
    }
    
    // Fall back to role permissions
    return permissions.rolePermissions[permissionKey] === true;
  }, [permissions]);

  // Check if user has any of the given permissions
  const hasAnyPermission = useCallback((permissionKeys: string[]): boolean => {
    return permissionKeys.some((key) => hasPermission(key));
  }, [hasPermission]);

  // Check if user has all of the given permissions
  const hasAllPermissions = useCallback((permissionKeys: string[]): boolean => {
    return permissionKeys.every((key) => hasPermission(key));
  }, [hasPermission]);

  // Check if user can access a module (any view permission in that module)
  const canAccess = useCallback((module: string): boolean => {
    if (!permissions) return false;
    if (permissions.isOwner) return true;

    // Get the module prefix for permission keys
    const modulePrefix = module.toLowerCase().replace(/\s+/g, "_");
    
    // Check role permissions for any view permission in this module
    const hasRoleAccess = Object.entries(permissions.rolePermissions).some(
      ([key, value]) => key.startsWith(`${modulePrefix}:`) && value
    );
    
    // Check overrides
    const hasOverrideAccess = Object.entries(permissions.overrides).some(
      ([key, value]) => key.startsWith(`${modulePrefix}:`) && value
    );
    
    return hasRoleAccess || hasOverrideAccess;
  }, [permissions]);

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccess,
    refresh: fetchPermissions,
  };
}

// Permission keys organized by module
export const PERMISSION_KEYS = {
  forms: {
    view: "forms:view",
    create: "forms:create",
    edit: "forms:edit",
    delete: "forms:delete",
    export: "forms:export",
    typesManage: "forms:types:manage",
  },
  documents: {
    view: "documents:view",
    create: "documents:create",
    edit: "documents:edit",
    delete: "documents:delete",
    typesManage: "documents:types:manage",
  },
  maintenance: {
    view: "maintenance:view",
    create: "maintenance:create",
    edit: "maintenance:edit",
    delete: "maintenance:delete",
    complete: "maintenance:complete",
    costsView: "maintenance:costs:view",
    costsEdit: "maintenance:costs:edit",
    typesManage: "maintenance:types:manage",
  },
  vehicles: {
    view: "vehicles:view",
    create: "vehicles:create",
    edit: "vehicles:edit",
    delete: "vehicles:delete",
    usageView: "vehicles:usage:view",
  },
  drivers: {
    view: "drivers:view",
    create: "drivers:create",
    edit: "drivers:edit",
    delete: "drivers:delete",
  },
  employees: {
    view: "employees:view",
    create: "employees:create",
    edit: "employees:edit",
    delete: "employees:delete",
  },
  hr: {
    view: "hr:view",
    leaveApprove: "hr:leave:approve",
    leaveManage: "hr:leave:manage",
    holidaysManage: "hr:holidays:manage",
  },
  settings: {
    view: "settings:view",
    edit: "settings:edit",
    usersView: "settings:users:view",
    usersManage: "settings:users:manage",
    rolesManage: "settings:roles:manage",
    integrationsManage: "settings:integrations:manage",
  },
  logs: {
    view: "logs:view",
    export: "logs:export",
  },
  fsm: {
    view: "fsm:view",
    tasksCreate: "fsm:tasks:create",
    tasksEdit: "fsm:tasks:edit",
    tasksDelete: "fsm:tasks:delete",
    tasksDispatch: "fsm:tasks:dispatch",
    geofencesManage: "fsm:geofences:manage",
    formsManage: "fsm:forms:manage",
    reportsView: "fsm:reports:view",
  },
} as const;

// Default role presets
export const DEFAULT_ROLE_PRESETS = {
  fleetManager: {
    name: "Fleet Manager",
    description: "Full access to all features",
    color: "#3b82f6",
    hierarchyLevel: 10,
    permissions: {
      ...Object.values(PERMISSION_KEYS.forms).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.documents).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.maintenance).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.vehicles).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.drivers).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.employees).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.hr).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.fsm).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.settings).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.logs).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
    },
  },
  operationsManager: {
    name: "Operations Manager",
    description: "Manage operations and staff",
    color: "#10b981",
    hierarchyLevel: 20,
    permissions: {
      ...Object.values(PERMISSION_KEYS.forms).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.documents).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.maintenance).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      ...Object.values(PERMISSION_KEYS.fsm).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      [PERMISSION_KEYS.vehicles.view]: true,
      [PERMISSION_KEYS.drivers.view]: true,
      [PERMISSION_KEYS.employees.view]: true,
      [PERMISSION_KEYS.hr.view]: true,
      [PERMISSION_KEYS.hr.leaveApprove]: true,
      [PERMISSION_KEYS.settings.view]: true,
      [PERMISSION_KEYS.logs.view]: true,
    },
  },
  dispatcher: {
    name: "Dispatcher",
    description: "Manage daily operations and forms",
    color: "#f59e0b",
    hierarchyLevel: 50,
    permissions: {
      ...Object.values(PERMISSION_KEYS.forms).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      [PERMISSION_KEYS.fsm.view]: true,
      [PERMISSION_KEYS.fsm.tasksCreate]: true,
      [PERMISSION_KEYS.fsm.tasksEdit]: true,
      [PERMISSION_KEYS.fsm.tasksDispatch]: true,
      [PERMISSION_KEYS.documents.view]: true,
      [PERMISSION_KEYS.maintenance.view]: true,
      [PERMISSION_KEYS.vehicles.view]: true,
      [PERMISSION_KEYS.drivers.view]: true,
    },
  },
  mechanic: {
    name: "Mechanic",
    description: "Maintenance and repairs",
    color: "#6b7280",
    hierarchyLevel: 60,
    permissions: {
      [PERMISSION_KEYS.maintenance.view]: true,
      [PERMISSION_KEYS.maintenance.create]: true,
      [PERMISSION_KEYS.maintenance.edit]: true,
      [PERMISSION_KEYS.maintenance.complete]: true,
      [PERMISSION_KEYS.vehicles.view]: true,
    },
  },
  accountant: {
    name: "Accountant",
    description: "Financial and cost reports",
    color: "#8b5cf6",
    hierarchyLevel: 40,
    permissions: {
      [PERMISSION_KEYS.forms.view]: true,
      [PERMISSION_KEYS.forms.export]: true,
      [PERMISSION_KEYS.documents.view]: true,
      [PERMISSION_KEYS.maintenance.view]: true,
      [PERMISSION_KEYS.maintenance.costsView]: true,
      [PERMISSION_KEYS.maintenance.costsEdit]: true,
      [PERMISSION_KEYS.vehicles.view]: true,
      [PERMISSION_KEYS.logs.view]: true,
      [PERMISSION_KEYS.logs.export]: true,
    },
  },
  planner: {
    name: "Planner",
    description: "Plan maintenance and schedules",
    color: "#ec4899",
    hierarchyLevel: 50,
    permissions: {
      [PERMISSION_KEYS.forms.view]: true,
      [PERMISSION_KEYS.documents.view]: true,
      [PERMISSION_KEYS.maintenance.view]: true,
      [PERMISSION_KEYS.maintenance.create]: true,
      [PERMISSION_KEYS.maintenance.edit]: true,
      [PERMISSION_KEYS.vehicles.view]: true,
      [PERMISSION_KEYS.drivers.view]: true,
    },
  },
  administrative: {
    name: "Administrative",
    description: "General administrative access",
    color: "#06b6d4",
    hierarchyLevel: 70,
    permissions: {
      [PERMISSION_KEYS.forms.view]: true,
      [PERMISSION_KEYS.documents.view]: true,
      [PERMISSION_KEYS.documents.create]: true,
      [PERMISSION_KEYS.documents.edit]: true,
      [PERMISSION_KEYS.maintenance.view]: true,
      [PERMISSION_KEYS.vehicles.view]: true,
      [PERMISSION_KEYS.drivers.view]: true,
      [PERMISSION_KEYS.employees.view]: true,
    },
  },
};
