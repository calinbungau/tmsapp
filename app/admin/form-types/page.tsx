"use client";

import React from "react"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  FileText,
  Trash2,
  Edit,
  GripVertical,
  Camera,
  ToggleLeft,
  Type,
  Hash,
  PenTool,
  Calendar,
  CalendarDays,
  CalendarRange,
  Zap,
  ClipboardList,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";
import type { FormTemplate, FormQuestion, FormFrequency, QuestionType } from "@/lib/types";
import { FORM_FREQUENCY_LABELS, QUESTION_TYPE_LABELS } from "@/lib/types";

const FREQUENCY_ICONS: Record<FormFrequency, React.ReactNode> = {
  daily: <Calendar className="h-4 w-4" />,
  weekly: <CalendarDays className="h-4 w-4" />,
  monthly: <CalendarRange className="h-4 w-4" />,
  on_demand: <Zap className="h-4 w-4" />,
};

const QUESTION_TYPE_ICONS: Record<QuestionType, React.ReactNode> = {
  yes_no: <ToggleLeft className="h-4 w-4" />,
  photo: <Camera className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  signature: <PenTool className="h-4 w-4" />,
};

export default function AdminFormsPage() {
  const router = useRouter();
  const { session: adminSession } = useAdminSession();
  const { t } = useTranslation();
  const [forms, setForms] = useState<(FormTemplate & { questions: FormQuestion[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<FormTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    frequency: "daily" as FormFrequency,
  });

  const fetchForms = async () => {
    if (!adminSession?.id) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("form_templates")
      .select(`
        *,
        questions:form_questions(*)
      `)
      .eq("admin_id", adminSession.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setForms(data as (FormTemplate & { questions: FormQuestion[] })[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (adminSession?.id) {
      fetchForms();
    }
  }, [adminSession?.id]);

  const handleCreateForm = async () => {
    if (!adminSession?.id || !formData.name) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("form_templates")
      .insert({
        admin_id: adminSession.id,
        name: formData.name,
        description: formData.description || null,
        frequency: formData.frequency,
      })
      .select()
      .single();

    if (!error && data) {
      setDialogOpen(false);
      setFormData({ name: "", description: "", frequency: "daily" });
      router.push(`/admin/form-types/${data.id}`);
    }
  };

  const handleToggleActive = async (form: FormTemplate) => {
    const supabase = createClient();
    await supabase
      .from("form_templates")
      .update({ is_active: !form.is_active })
      .eq("id", form.id);

    fetchForms();
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm(t("forms.confirmDeleteForm"))) return;

    const supabase = createClient();
    await supabase.from("form_templates").delete().eq("id", formId);
    fetchForms();
  };

  const getFrequencyBadgeColor = (frequency: FormFrequency) => {
    switch (frequency) {
      case "daily":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "weekly":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "monthly":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "on_demand":
        return "bg-primary/20 text-primary border-primary/30";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/admin/forms"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("forms.backToForms")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("forms.formTypesTitle")}</h1>
          <p className="text-muted-foreground">
            {t("forms.formTypesSubtitle")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("forms.newForm")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("forms.createNewForm")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("forms.formName")}</Label>
                <Input
                  id="name"
                  placeholder={t("forms.formNamePlaceholder")}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("forms.descriptionOptional")}</Label>
                <Textarea
                  id="description"
                  placeholder={t("forms.descriptionPlaceholder")}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("forms.frequencyLabel")}</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: FormFrequency) =>
                    setFormData({ ...formData, frequency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {t("forms.dailyDesc")}
                      </div>
                    </SelectItem>
                    <SelectItem value="weekly">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        {t("forms.weeklyDesc")}
                      </div>
                    </SelectItem>
                    <SelectItem value="monthly">
                      <div className="flex items-center gap-2">
                        <CalendarRange className="h-4 w-4" />
                        {t("forms.monthlyDesc")}
                      </div>
                    </SelectItem>
                    <SelectItem value="on_demand">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        {t("forms.onDemandDesc")}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateForm} className="w-full" disabled={!formData.name}>
                {t("forms.createForm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Forms Grid */}
      {forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("forms.noFormsYet")}</h3>
            <p className="text-muted-foreground text-center mb-4">
              {t("forms.noFormsDesc")}
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("forms.createFirstForm")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card
              key={form.id}
              className={`cursor-pointer hover:shadow-md transition-all ${
                !form.is_active ? "opacity-60" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1" onClick={() => router.push(`/admin/form-types/${form.id}`)}>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      {form.name}
                    </CardTitle>
                    {form.description && (
                      <CardDescription className="mt-1 line-clamp-2">
                        {form.description}
                      </CardDescription>
                    )}
                  </div>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={() => handleToggleActive(form)}
                  />
                </div>
              </CardHeader>
              <CardContent onClick={() => router.push(`/admin/form-types/${form.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getFrequencyBadgeColor(form.frequency)}>
                      {FREQUENCY_ICONS[form.frequency]}
                      <span className="ml-1">{FORM_FREQUENCY_LABELS[form.frequency]}</span>
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {form.questions?.length || 0} {t("forms.questions")}
                  </span>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/admin/form-types/${form.id}`);
                    }}
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    {t("forms.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteForm(form.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
