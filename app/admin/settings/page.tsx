"use client";

import React from "react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Check, HardDrive, Users, Car, FileText, Building, Building2, MapPin, Loader2, ChevronRight, UserCog, FolderTree, ArrowLeftRight, Mail, Link2, Bell } from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import { AppearanceSettings } from "@/components/appearance-settings";
import { useTranslation } from "@/components/i18n/i18n-provider";
import Link from "next/link";

export default function AdminSettingsPage() {
  const { session: adminSession } = useAdminSession();
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Traccar settings
  const [traccarServerUrl, setTraccarServerUrl] = useState("");
  const [traccarEmail, setTraccarEmail] = useState("");
  const [traccarPassword, setTraccarPassword] = useState("");
  const [testingTraccar, setTestingTraccar] = useState(false);
  const [traccarMessage, setTraccarMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Stats
  const [stats, setStats] = useState({
    storageSize: 0,
    driverCount: 0,
    vehicleCount: 0,
    inspectionCount: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!adminSession?.id) return;

    const fetchStats = async () => {
      const supabase = createClient();
      
      // Fetch admin details including Traccar settings and super admin status
      const { data: adminData } = await supabase
        .from("admins")
        .select("company_name, traccar_server_url, traccar_email, traccar_password, is_super_admin")
        .eq("id", adminSession.id)
        .single();
      
      if (adminData?.is_super_admin) {
        setIsSuperAdmin(true);
      }
      
      if (adminData?.company_name) {
        setCompanyName(adminData.company_name);
      }
      if (adminData?.traccar_server_url) {
        setTraccarServerUrl(adminData.traccar_server_url);
      }
      if (adminData?.traccar_email) {
        setTraccarEmail(adminData.traccar_email);
      }
      if (adminData?.traccar_password) {
        setTraccarPassword(adminData.traccar_password);
      }

      // Fetch counts
      const [driversResult, vehiclesResult, inspectionsResult] = await Promise.all([
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("admin_id", adminSession.id),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("admin_id", adminSession.id),
        supabase.from("inspections").select("id", { count: "exact", head: true }).eq("admin_id", adminSession.id),
      ]);

      // Calculate storage size by listing files in admin's folder
      let totalSize = 0;
      try {
        const { data: files } = await supabase.storage
          .from("inspection-photos")
          .list(adminSession.id, { limit: 1000 });
        
        if (files) {
          // List files in subfolders (inspection IDs)
          for (const folder of files) {
            if (folder.id) {
              const { data: subFiles } = await supabase.storage
                .from("inspection-photos")
                .list(`${adminSession.id}/${folder.name}`, { limit: 100 });
              
              if (subFiles) {
                for (const file of subFiles) {
                  if (file.metadata?.size) {
                    totalSize += file.metadata.size;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Error calculating storage:", e);
      }

      setStats({
        storageSize: totalSize,
        driverCount: driversResult.count || 0,
        vehicleCount: vehiclesResult.count || 0,
        inspectionCount: inspectionsResult.count || 0,
      });
      setLoadingStats(false);
    };

    fetchStats();
  }, [adminSession?.id]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleUpdateCompany = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("admins")
        .update({ company_name: companyName, updated_at: new Date().toISOString() })
        .eq("id", adminSession.id);

      if (error) {
        setMessage({ type: "error", text: t("settings.msgCompanyFailed") });
      } else {
        // Update localStorage
        const session = JSON.parse(localStorage.getItem("admin_session") || "{}");
        session.company_name = companyName;
        localStorage.setItem("admin_session", JSON.stringify(session));
        setMessage({ type: "success", text: t("settings.msgCompanyUpdated") });
      }
    } catch {
      setMessage({ type: "error", text: t("settings.msgSomethingWrong") });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTraccar = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    setTraccarMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("admins")
        .update({
          traccar_server_url: traccarServerUrl || null,
          traccar_email: traccarEmail || null,
          traccar_password: traccarPassword || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", adminSession.id);

      if (error) {
        setTraccarMessage({ type: "error", text: t("settings.msgTraccarFailed") });
      } else {
        setTraccarMessage({ type: "success", text: t("settings.msgTraccarSaved") });
      }
    } catch {
      setTraccarMessage({ type: "error", text: t("settings.msgSomethingWrong") });
    } finally {
      setLoading(false);
    }
  };

  const handleTestTraccar = async () => {
    if (!adminSession?.id || !traccarServerUrl || !traccarEmail || !traccarPassword) {
      setTraccarMessage({ type: "error", text: t("settings.msgTraccarFields") });
      return;
    }
    
    setTestingTraccar(true);
    setTraccarMessage(null);

    try {
      // First save the settings
      await handleSaveTraccar();
      
      // Then test the connection
      const response = await fetch(`/api/traccar?action=devices&adminId=${adminSession.id}`);
      const data = await response.json();

      if (response.ok && data.devices) {
        setTraccarMessage({ 
          type: "success", 
          text: t("settings.msgTraccarConnected").replace("{count}", String(data.devices.length)),
        });
      } else {
        setTraccarMessage({ 
          type: "error", 
          text: data.error || t("settings.msgTraccarConnectFailed"),
        });
      }
    } catch {
      setTraccarMessage({ type: "error", text: t("settings.msgTraccarTestFailed") });
    } finally {
      setTestingTraccar(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession?.id) return;
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: t("settings.msgPasswordMismatch") });
      return;
    }

    if (newPassword.length < 4) {
      setMessage({ type: "error", text: t("settings.msgPasswordTooShort") });
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      
      // Verify current password
      const { data: admin, error: fetchError } = await supabase
        .from("admins")
        .select("password_hash")
        .eq("id", adminSession.id)
        .single();

      if (fetchError || !admin) {
        setMessage({ type: "error", text: t("settings.msgPasswordVerifyFailed") });
        setLoading(false);
        return;
      }

      if (admin.password_hash !== currentPassword) {
        setMessage({ type: "error", text: t("settings.msgPasswordIncorrect") });
        setLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase
        .from("admins")
        .update({ password_hash: newPassword, updated_at: new Date().toISOString() })
        .eq("id", adminSession.id);

      if (updateError) {
        setMessage({ type: "error", text: t("settings.msgPasswordUpdateFailed") });
      } else {
        setMessage({ type: "success", text: t("settings.msgPasswordChanged") });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setMessage({ type: "error", text: t("settings.msgSomethingWrong") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      {/* Appearance: theme + language */}
      <AppearanceSettings />

      {/* Management Links - Only show to owners */}
      {(adminSession?.isOwner || !adminSession?.user_id) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/admin/settings/users">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <UserCog className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.usersRoles")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.usersRolesDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/roles">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.rolesPermissions")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.rolesPermissionsDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/company">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Building className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.companyProfile")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.companyProfileDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/forwarding">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <ArrowLeftRight className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.forwarderConfigurator")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.forwarderConfiguratorDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/series">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.seriesConfigurator")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.seriesConfiguratorDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/system-email">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-rose-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.systemEmail")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.systemEmailDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/action-center">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.actionCenter")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.actionCenterDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/integrations">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <Link2 className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.integrations")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.integrationsDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/settings/ai-instructions">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-violet-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("settings.aiExtraction")}</h3>
                      <p className="text-sm text-muted-foreground">{t("settings.aiExtractionDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          {isSuperAdmin && (
            <Link href="/admin/settings/tenants">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{t("settings.tenantManagement")}</h3>
                        <p className="text-sm text-muted-foreground">{t("settings.tenantManagementDesc")}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <CardTitle>{t("settings.usageStatistics")}</CardTitle>
          </div>
          <CardDescription>{t("settings.usageStatisticsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <p className="text-muted-foreground">{t("settings.loadingStatistics")}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <HardDrive className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{formatBytes(stats.storageSize)}</p>
                <p className="text-xs text-muted-foreground">{t("settings.storageUsed")}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <Users className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold">{stats.driverCount}</p>
                <p className="text-xs text-muted-foreground">{t("settings.drivers")}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <Car className="h-6 w-6 mx-auto mb-2 text-orange-500" />
                <p className="text-2xl font-bold">{stats.vehicleCount}</p>
                <p className="text-xs text-muted-foreground">{t("settings.vehicles")}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <FileText className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                <p className="text-2xl font-bold">{stats.inspectionCount}</p>
                <p className="text-xs text-muted-foreground">{t("settings.inspections")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Name */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            <CardTitle>{t("settings.companyInformation")}</CardTitle>
          </div>
          <CardDescription>{t("settings.companyInformationDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t("settings.companyNamePlaceholder")}
              className="flex-1"
            />
            <Button onClick={handleUpdateCompany} disabled={loading}>
              {loading ? t("settings.saving") : t("settings.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Traccar GPS Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle>{t("settings.traccarTitle")}</CardTitle>
          </div>
          <CardDescription>
            {t("settings.traccarDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="traccar-url">{t("settings.serverUrl")}</Label>
            <Input
              id="traccar-url"
              value={traccarServerUrl}
              onChange={(e) => setTraccarServerUrl(e.target.value)}
              placeholder={t("settings.serverUrlPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="traccar-email">{t("settings.email")}</Label>
            <Input
              id="traccar-email"
              type="email"
              value={traccarEmail}
              onChange={(e) => setTraccarEmail(e.target.value)}
              placeholder={t("settings.emailPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="traccar-password">{t("settings.password")}</Label>
            <Input
              id="traccar-password"
              type="password"
              value={traccarPassword}
              onChange={(e) => setTraccarPassword(e.target.value)}
              placeholder={t("settings.traccarPasswordPlaceholder")}
            />
          </div>
          
          {traccarMessage && (
            <div
              className={`p-3 rounded-lg text-sm ${
                traccarMessage.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {traccarMessage.type === "success" && <Check className="h-4 w-4 inline mr-2" />}
              {traccarMessage.text}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button onClick={handleSaveTraccar} disabled={loading}>
              {loading ? t("settings.saving") : t("settings.save")}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestTraccar}
              disabled={testingTraccar || !traccarServerUrl}
              className="bg-transparent"
            >
              {testingTraccar ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("settings.testing")}
                </>
              ) : (
                t("settings.testConnection")
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>{t("settings.changePassword")}</CardTitle>
          </div>
          <CardDescription>{t("settings.changePasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">{t("settings.currentPassword")}</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">{t("settings.newPassword")}</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("settings.confirmNewPassword")}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("settings.confirmNewPasswordPlaceholder")}
                required
              />
            </div>

            {message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {message.type === "success" && <Check className="h-4 w-4 inline mr-2" />}
                {message.text}
              </div>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? t("settings.saving") : t("settings.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t("settings.aboutProduct")}</p>
          <p>{t("settings.aboutDescription")}</p>
          <p className="text-xs mt-4">{t("settings.account")}: {adminSession?.email}</p>
        </CardContent>
      </Card>
    </div>
  );
}
