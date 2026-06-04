import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A carrier business partner resolved from a carrier group, trimmed to the
 * fields we need to notify them (email + display name).
 */
export interface ResolvedCarrier {
  id: string;
  name: string;
  email: string | null;
  country: string | null;
  city: string | null;
}

interface GroupRule {
  field: string;
  operator: string;
  value: string | null;
}

/**
 * Resolves the set of carrier business partners that belong to the given
 * carrier groups for an admin.
 *
 * - Static groups: explicit membership via `carrier_group_members`.
 * - Dynamic groups: rule-based, mirroring the rule fields exposed in the
 *   carrier-groups UI (country / has_trucks / has_trailers / name_contains).
 *
 * The result is de-duplicated across groups (a carrier in two distributed
 * groups is only emailed once) and keyed back to the groups it matched so the
 * caller can report per-group reach.
 *
 * This runs server-side with a service-role client; all queries are still
 * scoped by `admin_id` so one tenant can never resolve another tenant's
 * carriers.
 */
export async function resolveCarriersForGroups(
  supabase: SupabaseClient,
  adminId: string,
  groupIds: string[]
): Promise<{
  carriers: ResolvedCarrier[];
  byGroup: Record<string, ResolvedCarrier[]>;
}> {
  const byGroup: Record<string, ResolvedCarrier[]> = {};
  const merged = new Map<string, ResolvedCarrier>();

  if (groupIds.length === 0) {
    return { carriers: [], byGroup };
  }

  // Load the groups themselves so we know which are static vs dynamic.
  const { data: groups } = await supabase
    .from("carrier_groups")
    .select("id, group_type, match_mode")
    .eq("admin_id", adminId)
    .in("id", groupIds);

  if (!groups || groups.length === 0) {
    return { carriers: [], byGroup };
  }

  const staticGroupIds = groups.filter((g) => g.group_type !== "dynamic").map((g) => g.id);
  const dynamicGroups = groups.filter((g) => g.group_type === "dynamic");

  // ── Static groups: explicit membership ──────────────────────────────
  if (staticGroupIds.length > 0) {
    const { data: members } = await supabase
      .from("carrier_group_members")
      .select("group_id, business_partner_id")
      .in("group_id", staticGroupIds);

    const memberIds = Array.from(
      new Set((members || []).map((m) => m.business_partner_id))
    );

    if (memberIds.length > 0) {
      const { data: partners } = await supabase
        .from("business_partners")
        .select("id, name, email, country, city")
        .eq("admin_id", adminId)
        .in("id", memberIds);

      const partnerMap = new Map<string, ResolvedCarrier>();
      (partners || []).forEach((p) => partnerMap.set(p.id, p as ResolvedCarrier));

      (members || []).forEach((m) => {
        const carrier = partnerMap.get(m.business_partner_id);
        if (!carrier) return;
        if (!byGroup[m.group_id]) byGroup[m.group_id] = [];
        byGroup[m.group_id].push(carrier);
        merged.set(carrier.id, carrier);
      });
    }
  }

  // ── Dynamic groups: rule-based matching ─────────────────────────────
  if (dynamicGroups.length > 0) {
    // All carrier business partners for the tenant — the candidate pool that
    // dynamic rules filter down.
    const { data: allCarriers } = await supabase
      .from("business_partners")
      .select("id, name, email, country, city")
      .eq("admin_id", adminId)
      .contains("types", ["carrier"]);

    const candidates = (allCarriers || []) as ResolvedCarrier[];

    // Pre-compute fleet capability sets only if any rule needs them, since
    // these are extra round-trips.
    const dynamicGroupIds = dynamicGroups.map((g) => g.id);
    const { data: allRules } = await supabase
      .from("carrier_group_rules")
      .select("group_id, field, operator, value")
      .in("group_id", dynamicGroupIds);

    const rulesByGroup: Record<string, GroupRule[]> = {};
    (allRules || []).forEach((r) => {
      if (!rulesByGroup[r.group_id]) rulesByGroup[r.group_id] = [];
      rulesByGroup[r.group_id].push(r);
    });

    const needsTrucks = (allRules || []).some((r) => r.field === "has_trucks");
    const needsTrailers = (allRules || []).some((r) => r.field === "has_trailers");

    let truckOwnerIds = new Set<string>();
    let trailerOwnerIds = new Set<string>();

    if (needsTrucks) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("business_partner_id")
        .eq("admin_id", adminId)
        .not("business_partner_id", "is", null);
      truckOwnerIds = new Set(
        (vehicles || []).map((v) => v.business_partner_id).filter(Boolean)
      );
    }
    if (needsTrailers) {
      const { data: trailers } = await supabase
        .from("trailers")
        .select("business_partner_id")
        .eq("admin_id", adminId)
        .not("business_partner_id", "is", null);
      trailerOwnerIds = new Set(
        (trailers || []).map((t) => t.business_partner_id).filter(Boolean)
      );
    }

    const matchesRule = (carrier: ResolvedCarrier, rule: GroupRule): boolean => {
      const val = (rule.value || "").trim();
      switch (rule.field) {
        case "country": {
          const country = (carrier.country || "").trim().toLowerCase();
          if (rule.operator === "eq") return country === val.toLowerCase();
          if (rule.operator === "neq") return country !== val.toLowerCase();
          if (rule.operator === "in") {
            const list = val
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);
            return list.includes(country);
          }
          return false;
        }
        case "has_trucks": {
          const has = truckOwnerIds.has(carrier.id);
          return rule.operator === "is_true" ? has : !has;
        }
        case "has_trailers": {
          const has = trailerOwnerIds.has(carrier.id);
          return rule.operator === "is_true" ? has : !has;
        }
        case "name_contains": {
          if (!val) return true;
          return (carrier.name || "").toLowerCase().includes(val.toLowerCase());
        }
        default:
          return false;
      }
    };

    for (const group of dynamicGroups) {
      const rules = rulesByGroup[group.id] || [];
      const matchMode = group.match_mode === "any" ? "any" : "all";

      const matched = candidates.filter((carrier) => {
        if (rules.length === 0) return false; // no rules ⇒ matches nobody
        return matchMode === "all"
          ? rules.every((r) => matchesRule(carrier, r))
          : rules.some((r) => matchesRule(carrier, r));
      });

      byGroup[group.id] = matched;
      matched.forEach((c) => merged.set(c.id, c));
    }
  }

  return { carriers: Array.from(merged.values()), byGroup };
}
