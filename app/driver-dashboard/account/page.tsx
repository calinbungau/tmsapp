"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Globe, LogOut, Shield, Phone, Mail, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface DriverProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  created_at: string;
}

const LANGUAGE_OPTIONS = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
  { code: "ro", name: "Română" },
  { code: "pl", name: "Polski" },
  { code: "nl", name: "Nederlands" },
  { code: "ru", name: "Русский" },
];

export default function DriverAccountPage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }
    const driverData = JSON.parse(session);
    setDriver(driverData);
    fetchProfile(driverData.id);
  }, [router]);

  const fetchProfile = async (driverId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("drivers")
      .select("id, name, email, phone, language, created_at")
      .eq("id", driverId)
      .single();

    if (data) {
      setProfile(data);
    }
    setLoading(false);
  };

  const handleLanguageChange = async (language: string) => {
    if (!profile) return;
    
    setSavingLanguage(true);
    const supabase = createClient();
    
    await supabase
      .from("drivers")
      .update({ language })
      .eq("id", profile.id);

    // Update local storage
    localStorage.setItem("driver_language", language);
    
    setProfile({ ...profile, language });
    setSavingLanguage(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("driver_session");
    localStorage.removeItem("driver_language");
    localStorage.removeItem("current_inspection");
    localStorage.removeItem("selected_form");
    router.push("/driver");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Profile Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">{profile?.name}</p>
              <p className="text-sm text-muted-foreground">
                Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' }) : '-'}
              </p>
            </div>
          </div>

          {profile?.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{profile.email}</span>
            </div>
          )}

          {profile?.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{profile.phone}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select
              value={profile?.language || "en"}
              onValueChange={handleLanguageChange}
              disabled={savingLanguage}
            >
              <SelectTrigger id="language">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This will change the language for form instructions
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Leave Requests */}
      <Link href="/driver-dashboard/leave">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium">Leave Requests</p>
                <p className="text-xs text-muted-foreground">Request time off and view history</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {/* Security Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Your PIN code is managed by your administrator. Contact them if you need to change it.
          </p>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm">
              <span className="text-muted-foreground">PIN: </span>
              <span className="font-mono">****</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Logout Button */}
      <Button 
        variant="outline" 
        className="w-full bg-transparent text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Logout
      </Button>
    </div>
  );
}
