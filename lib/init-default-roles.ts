import { createClient } from "@/lib/supabase/client";
import { DEFAULT_ROLE_PRESETS } from "@/hooks/use-permissions";

/**
 * Initialize default roles for a new admin account.
 * This should be called after a new admin registers.
 */
export async function initializeDefaultRoles(adminId: string): Promise<void> {
  const supabase = createClient();

  // Check if admin already has roles
  const { data: existingRoles, error: checkError } = await supabase
    .from("roles")
    .select("id")
    .eq("admin_id", adminId)
    .limit(1);

  if (checkError) {
    console.error("Error checking existing roles:", checkError);
    return;
  }

  // If roles already exist, don't create duplicates
  if (existingRoles && existingRoles.length > 0) {
    return;
  }

  // Create default roles
  const rolesToCreate = Object.values(DEFAULT_ROLE_PRESETS).map((preset) => ({
    admin_id: adminId,
    name: preset.name,
    description: preset.description,
    color: preset.color,
    hierarchy_level: preset.hierarchyLevel,
    permissions: preset.permissions,
    is_system_role: true,
    is_active: true,
  }));

  const { error: insertError } = await supabase
    .from("roles")
    .insert(rolesToCreate);

  if (insertError) {
    console.error("Error creating default roles:", insertError);
  }
}

/**
 * Create default departments for a new admin account.
 */
export async function initializeDefaultDepartments(adminId: string): Promise<void> {
  const supabase = createClient();

  // Check if admin already has departments
  const { data: existingDepts } = await supabase
    .from("departments")
    .select("id")
    .eq("admin_id", adminId)
    .limit(1);

  if (existingDepts && existingDepts.length > 0) {
    return;
  }

  const defaultDepartments = [
    { name: "Operations", description: "Fleet operations and dispatching" },
    { name: "Maintenance", description: "Vehicle maintenance and repairs" },
    { name: "Administration", description: "Administrative staff" },
    { name: "Finance", description: "Accounting and finance" },
  ];

  const deptsToCreate = defaultDepartments.map((dept) => ({
    admin_id: adminId,
    name: dept.name,
    description: dept.description,
    is_active: true,
  }));

  await supabase.from("departments").insert(deptsToCreate);
}

/**
 * Create the owner user account for an existing admin.
 * This links the admin to the new user system.
 */
export async function createOwnerUser(
  adminId: string,
  email: string,
  passwordHash: string
): Promise<string | null> {
  const supabase = createClient();

  // Check if owner user already exists
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("admin_id", adminId)
    .eq("is_owner", true)
    .single();

  if (existingUser) {
    return existingUser.id;
  }

  // Create the owner user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      admin_id: adminId,
      email: email,
      password_hash: passwordHash,
      is_owner: true,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating owner user:", error);
    return null;
  }

  return newUser?.id || null;
}
