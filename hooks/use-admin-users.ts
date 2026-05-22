"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Shape of a "dispatcher" — i.e. anyone who can create/own orders inside an
 * admin tenant. We unify users.email + employees.first_name/last_name into a
 * single display name string so the rest of the UI doesn't have to care
 * which side of the join produced it.
 *
 * `name` is what we render in the table cell / filter dropdown. It falls
 * back through employee full name → email local part → "Unknown" so we
 * always have *something* to show, even for accounts where the employee
 * link is missing or the email is malformed.
 */
export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
}

interface UseAdminUsersResult {
  users: AdminUser[];
  // Map<userId, AdminUser> — O(1) lookup for table rows that have a
  // `created_by` uuid and need to render a name.
  byId: Map<string, AdminUser>;
  loading: boolean;
}

/**
 * Loads every user that belongs to the given admin tenant, along with the
 * linked employee's first/last name (when present). The list is tiny
 * (typically 1–20 rows) so we always return the entire set and let callers
 * filter/lookup in memory — no need for paginated server-side fetches.
 *
 * The hook is cheap to call from multiple components on the same page
 * (e.g. the filters popover and a "created by" column in the table) but if
 * you ever need to share results across many components on the same page,
 * lift the call up and pass results down as props.
 */
export function useAdminUsers(adminId: string | undefined): UseAdminUsersResult {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      const supabase = createClient();
      // Two parallel queries: one for users (has the admin scoping +
      // employee_id), one for the employees themselves. We do NOT rely on
      // PostgREST embedding here because the FK name between users and
      // employees may differ per environment and we don't want a fragile
      // dependency.
      const { data: userRows } = await supabase
        .from("users")
        .select("id, email, employee_id")
        .eq("admin_id", adminId);
      if (cancelled) return;
      const empIds = Array.from(
        new Set((userRows || []).map(u => u.employee_id).filter(Boolean) as string[])
      );
      const empMap = new Map<string, { first: string | null; last: string | null }>();
      if (empIds.length > 0) {
        const { data: empRows } = await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .in("id", empIds);
        (empRows || []).forEach(e =>
          empMap.set(e.id, { first: e.first_name, last: e.last_name })
        );
      }
      if (cancelled) return;
      const out: AdminUser[] = (userRows || []).map(u => {
        const emp = u.employee_id ? empMap.get(u.employee_id) : null;
        const full = emp ? [emp.first, emp.last].filter(Boolean).join(" ").trim() : "";
        // Display priority: full name → email local-part → "Unknown".
        // We use the local part rather than the full email so the column
        // stays compact ("calin" vs "calin.bungau@sap.com").
        const fallback = u.email ? u.email.split("@")[0] : "Unknown";
        return {
          id: u.id,
          email: u.email ?? null,
          name: full || fallback,
        };
      });

      // ---- Also load the admins row(s) themselves ----
      // Some legacy code paths (notably AI extraction & older API routes)
      // wrote orders.created_by = admins.id rather than users.id. We
      // therefore also resolve admin IDs into the same lookup map so the
      // "Added" column / dispatcher filter works regardless of which scheme
      // a given order was created under. Tiny query — admins are tenant
      // accounts, typically 1 row per tenant.
      const { data: adminRows } = await supabase
        .from("admins")
        .select("id, email, name")
        .eq("id", adminId);
      if (cancelled) return;
      (adminRows || []).forEach(a => {
        if (out.some(u => u.id === a.id)) return; // already covered
        const fallback = a.email ? a.email.split("@")[0] : "Admin";
        out.push({
          id: a.id,
          email: a.email ?? null,
          name: a.name?.trim() || fallback,
        });
      });

      out.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(out);
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [adminId]);

  const byId = useMemo(() => {
    const m = new Map<string, AdminUser>();
    users.forEach(u => m.set(u.id, u));
    return m;
  }, [users]);

  return { users, byId, loading };
}
