"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Server, Shield, TestTube, Save, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminSession } from "@/hooks/use-admin-session";

interface SystemEmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
}

const defaultSettings: SystemEmailSettings = {
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: true,
  smtp_user: "",
  smtp_password: "",
  from_email: "",
  from_name: "",
  is_active: true,
};

export default function SystemEmailSettingsPage() {
  const { session: adminSession, isLoading: sessionLoading } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; message?: string } | null>(null);
  const [settings, setSettings] = useState<SystemEmailSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    if (adminSession?.id) {
      fetchSettings(adminSession.id);
    } else {
      setLoading(false);
    }
  }, [adminSession?.id, sessionLoading]);

  const fetchSettings = async (adminId: string) => {
    try {
      const res = await fetch(`/api/settings/system-email?adminId=${adminId}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setSettings({
            smtp_host: data.smtp_host || "",
            smtp_port: data.smtp_port || 587,
            smtp_secure: data.smtp_secure ?? true,
            smtp_user: data.smtp_user || "",
            smtp_password: data.smtp_password || "",
            from_email: data.from_email || "",
            from_name: data.from_name || "",
            is_active: data.is_active ?? true,
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
    setLoading(false);
  };

  const updateField = (field: keyof SystemEmailSettings, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setTestResult(null);
  };

  const testConnection = async () => {
    if (!adminSession) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings/system-email/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          test_email: testEmail || undefined,
        }),
      });
      const result = await res.json();
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: "Connection test failed" });
    }
    setTesting(false);
  };

  const saveSettings = async () => {
    if (!adminSession) return;
    setSaving(true);

    try {
      const res = await fetch("/api/settings/system-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId: adminSession.id,
          ...settings,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setHasChanges(false);
        alert("System email settings saved successfully!");
      } else {
        alert(result.error || "Failed to save settings");
      }
    } catch (err) {
      alert("Failed to save settings");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/admin/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-sm font-semibold">System Email Configuration</h1>
            <p className="text-xs text-muted-foreground">SMTP settings for automated emails (reports, notifications, alerts)</p>
          </div>
          <Button onClick={saveSettings} disabled={saving || !hasChanges} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">System Email vs User Email</p>
            <p className="text-muted-foreground mt-1">
              This email is used for <strong>automated system notifications</strong> like scheduled reports, maintenance reminders, and alerts. 
              Your <strong>user email</strong> (configured in Email settings) is used for business correspondence like orders and invoices.
            </p>
          </div>
        </div>

        {/* SMTP Server */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              SMTP Server
            </CardTitle>
            <CardDescription>Configure your outgoing mail server</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_host">SMTP Host</Label>
                <Input
                  id="smtp_host"
                  placeholder="smtp.example.com"
                  value={settings.smtp_host}
                  onChange={(e) => updateField("smtp_host", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_port">Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  placeholder="587"
                  value={settings.smtp_port}
                  onChange={(e) => updateField("smtp_port", parseInt(e.target.value) || 587)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <Label htmlFor="smtp_secure" className="cursor-pointer">Use SSL/TLS</Label>
                <p className="text-xs text-muted-foreground">Enable for secure connection (recommended)</p>
              </div>
              <Switch
                id="smtp_secure"
                checked={settings.smtp_secure}
                onCheckedChange={(v) => updateField("smtp_secure", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Authentication
            </CardTitle>
            <CardDescription>SMTP login credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_user">Username</Label>
              <Input
                id="smtp_user"
                placeholder="your-email@example.com"
                value={settings.smtp_user}
                onChange={(e) => updateField("smtp_user", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_password">Password</Label>
              <Input
                id="smtp_password"
                type="password"
                placeholder="Enter password or app-specific password"
                value={settings.smtp_password}
                onChange={(e) => updateField("smtp_password", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                For Gmail/Google Workspace, use an App Password. For Office 365, you may need to enable SMTP AUTH.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sender Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              Sender Identity
            </CardTitle>
            <CardDescription>How recipients will see system emails</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                placeholder="Fleet Reports"
                value={settings.from_name}
                onChange={(e) => updateField("from_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_email">From Email</Label>
              <Input
                id="from_email"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={settings.from_email}
                onChange={(e) => updateField("from_email", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This should match or be allowed by your SMTP server to avoid delivery issues.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Test Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TestTube className="h-4 w-4 text-primary" />
              Test Connection
            </CardTitle>
            <CardDescription>Verify your SMTP settings work correctly by sending a test email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test_email">Test Email Address (optional)</Label>
              <Input
                id="test_email"
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter an email to receive a test message. If left empty, only settings validation will be performed.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={testConnection}
                disabled={testing || !settings.smtp_host || !settings.smtp_user}
                className="gap-2"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                {testEmail ? "Send Test Email" : "Validate Settings"}
              </Button>
              
              {testResult && (
                <div className={`flex items-center gap-2 text-sm ${testResult.success ? "text-green-500" : "text-destructive"}`}>
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      {testResult.message || (testEmail ? "Test email sent!" : "Settings valid!")}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      {testResult.error || "Validation failed"}
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Enable/Disable */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_active" className="text-base font-medium cursor-pointer">Enable System Email</Label>
                <p className="text-sm text-muted-foreground">When disabled, system emails will be queued but not sent</p>
              </div>
              <Switch
                id="is_active"
                checked={settings.is_active}
                onCheckedChange={(v) => updateField("is_active", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Common SMTP Configs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Common SMTP Configurations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Gmail / Google Workspace</p>
                  <p className="text-xs text-muted-foreground">smtp.gmail.com : 587 (TLS)</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettings((p) => ({ ...p, smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_secure: true }));
                    setHasChanges(true);
                  }}
                >
                  Use
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Microsoft 365 / Outlook</p>
                  <p className="text-xs text-muted-foreground">smtp.office365.com : 587 (TLS)</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettings((p) => ({ ...p, smtp_host: "smtp.office365.com", smtp_port: 587, smtp_secure: true }));
                    setHasChanges(true);
                  }}
                >
                  Use
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Amazon SES (EU West)</p>
                  <p className="text-xs text-muted-foreground">email-smtp.eu-west-1.amazonaws.com : 587</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettings((p) => ({ ...p, smtp_host: "email-smtp.eu-west-1.amazonaws.com", smtp_port: 587, smtp_secure: true }));
                    setHasChanges(true);
                  }}
                >
                  Use
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
