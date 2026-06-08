"use client";

import React from "react"

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Camera,
  ToggleLeft,
  Type,
  Hash,
  PenTool,
  Save,
  Eye,
  Languages,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";
import type { FormTemplate, FormQuestion, QuestionType } from "@/lib/types";
import { FORM_FREQUENCY_LABELS, QUESTION_TYPE_LABELS } from "@/lib/types";

const FORM_LANGUAGES = [
  { code: "en", name: "English", flag: "GB" },
  { code: "ro", name: "Romana", flag: "RO" },
  { code: "de", name: "Deutsch", flag: "DE" },
  { code: "es", name: "Espanol", flag: "ES" },
  { code: "fr", name: "Francais", flag: "FR" },
  { code: "it", name: "Italiano", flag: "IT" },
  { code: "pt", name: "Portugues", flag: "PT" },
  { code: "pl", name: "Polski", flag: "PL" },
  { code: "nl", name: "Nederlands", flag: "NL" },
  { code: "ru", name: "Russkiy", flag: "RU" },
];

const QUESTION_TYPE_ICONS: Record<QuestionType, React.ReactNode> = {
  yes_no: <ToggleLeft className="h-4 w-4" />,
  photo: <Camera className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  signature: <PenTool className="h-4 w-4" />,
};

export default function FormEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { session: adminSession } = useAdminSession();
  const { t } = useTranslation();
  const [form, setForm] = useState<FormTemplate | null>(null);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null);
  const [questionData, setQuestionData] = useState({
    question_text: "",
    question_type: "yes_no" as QuestionType,
    is_required: true,
    max_photos: 1,
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [showTranslations, setShowTranslations] = useState(false);

  const fetchForm = async () => {
    const supabase = createClient();
    
    const { data: formData, error: formError } = await supabase
      .from("form_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (formError || !formData) {
      router.push("/admin/forms");
      return;
    }

    const { data: questionsData } = await supabase
      .from("form_questions")
      .select("*")
      .eq("form_template_id", id)
      .order("order_index");

    setForm(formData);
    setQuestions(questionsData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchForm();
  }, [id]);

  const handleSaveForm = async () => {
    if (!form) return;
    setSaving(true);

    const supabase = createClient();
    await supabase
      .from("form_templates")
      .update({
        name: form.name,
        description: form.description,
      })
      .eq("id", form.id);

    setSaving(false);
  };

  const handleAddQuestion = async () => {
    if (!questionData.question_text) return;

    const supabase = createClient();
    const newOrder = questions.length;
    
    // Build options object for photo questions
    const options = questionData.question_type === "photo" 
      ? { max_photos: questionData.max_photos || 1 }
      : null;

    // Filter out empty translations
    const cleanTranslations = Object.fromEntries(
      Object.entries(translations).filter(([, v]) => v.trim() !== "")
    );
    const translationsToSave = Object.keys(cleanTranslations).length > 0 ? cleanTranslations : null;

    if (editingQuestion) {
      await supabase
        .from("form_questions")
        .update({
          question_text: questionData.question_text,
          question_type: questionData.question_type,
          is_required: questionData.is_required,
          options,
          translations: translationsToSave,
        })
        .eq("id", editingQuestion.id);
    } else {
      await supabase.from("form_questions").insert({
        form_template_id: id,
        question_text: questionData.question_text,
        question_type: questionData.question_type,
        is_required: questionData.is_required,
        order_index: newOrder,
        options,
        translations: translationsToSave,
      });
    }

    setDialogOpen(false);
    setEditingQuestion(null);
    setQuestionData({ question_text: "", question_type: "yes_no", is_required: true, max_photos: 1 });
    setTranslations({});
    setShowTranslations(false);
    fetchForm();
  };

  const handleEditQuestion = (question: FormQuestion) => {
    setEditingQuestion(question);
    setQuestionData({
      question_text: question.question_text,
      question_type: question.question_type,
      is_required: question.is_required,
      max_photos: (question.options as { max_photos?: number })?.max_photos || 1,
    });
    setTranslations((question as any).translations || {});
    setShowTranslations(Object.keys((question as any).translations || {}).length > 0);
    setDialogOpen(true);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm(t("forms.confirmDeleteQuestion"))) return;

    const supabase = createClient();
    await supabase.from("form_questions").delete().eq("id", questionId);
    fetchForm();
  };

  const handleMoveQuestion = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const supabase = createClient();
    const currentQuestion = questions[index];
    const swapQuestion = questions[newIndex];

    await Promise.all([
      supabase
        .from("form_questions")
        .update({ order_index: newIndex })
        .eq("id", currentQuestion.id),
      supabase
        .from("form_questions")
        .update({ order_index: index })
        .eq("id", swapQuestion.id),
    ]);

    fetchForm();
  };

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push("/admin/forms")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="text-xl font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
            placeholder={t("forms.formNamePh")}
          />
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{FORM_FREQUENCY_LABELS[form.frequency]}</Badge>
            <span className="text-sm text-muted-foreground">
              {questions.length} {questions.length !== 1 ? t("forms.questionCountLabelPlural") : t("forms.questionCountLabel")}
            </span>
          </div>
        </div>
        <Button onClick={handleSaveForm} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? t("forms.saving") : t("forms.save")}
        </Button>
      </div>

      {/* Description */}
      <Card>
        <CardContent className="pt-4">
          <Label htmlFor="description">{t("forms.description")}</Label>
          <Textarea
            id="description"
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t("forms.descriptionPlaceholder")}
            className="mt-2"
          />
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("forms.questionsHeading")}</h2>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingQuestion(null);
              setQuestionData({ question_text: "", question_type: "yes_no", is_required: true, max_photos: 1 });
              setTranslations({});
              setShowTranslations(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("forms.addQuestion")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingQuestion ? t("forms.editQuestion") : t("forms.addQuestion")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="question_text">{t("forms.question")}</Label>
                  <Textarea
                    id="question_text"
                    placeholder={t("forms.questionPlaceholder")}
                    value={questionData.question_text}
                    onChange={(e) =>
                      setQuestionData({ ...questionData, question_text: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("forms.answerType")}</Label>
                  <Select
                    value={questionData.question_type}
                    onValueChange={(value: QuestionType) =>
                      setQuestionData({ ...questionData, question_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes_no">
                        <div className="flex items-center gap-2">
                          <ToggleLeft className="h-4 w-4" />
                          {t("forms.yesNoDesc")}
                        </div>
                      </SelectItem>
                      <SelectItem value="photo">
                        <div className="flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          {t("forms.photoDesc")}
                        </div>
                      </SelectItem>
                      <SelectItem value="text">
                        <div className="flex items-center gap-2">
                          <Type className="h-4 w-4" />
                          {t("forms.textDesc")}
                        </div>
                      </SelectItem>
                      <SelectItem value="number">
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4" />
                          {t("forms.numberDesc")}
                        </div>
                      </SelectItem>
                      <SelectItem value="signature">
                        <div className="flex items-center gap-2">
                          <PenTool className="h-4 w-4" />
                          {t("forms.signatureDesc")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {questionData.question_type === "photo" && (
                  <div className="space-y-2">
                    <Label>{t("forms.numberOfPhotos")}</Label>
                    <Select
                      value={questionData.max_photos.toString()}
                      onValueChange={(value) =>
                        setQuestionData({ ...questionData, max_photos: parseInt(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t("forms.onePhoto")}</SelectItem>
                        <SelectItem value="2">2 {t("forms.photosCount")}</SelectItem>
                        <SelectItem value="3">3 {t("forms.photosCount")}</SelectItem>
                        <SelectItem value="4">4 {t("forms.photosCount")}</SelectItem>
                        <SelectItem value="5">5 {t("forms.photosCount")}</SelectItem>
                        <SelectItem value="10">{t("forms.upTo10Photos")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {questionData.max_photos === 1 
                        ? t("forms.exactlyOnePhoto") 
                        : t("forms.upToNPhotos").replace("{n}", String(questionData.max_photos))}
                    </p>
                  </div>
                )}
                {/* Translations */}
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowTranslations(!showTranslations)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span>{t("forms.translations")}</span>
                      {Object.values(translations).filter(v => v.trim()).length > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {Object.values(translations).filter(v => v.trim()).length}
                        </Badge>
                      )}
                    </div>
                    {showTranslations ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {showTranslations && (
                    <div className="border-t border-border/50 px-3 py-3 space-y-2.5 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">
                        {t("forms.translationsHelp")}
                      </p>
                      {FORM_LANGUAGES.filter(l => l.code !== "en").map((lang) => (
                        <div key={lang.code} className="flex items-start gap-2">
                          <span className="mt-2.5 text-xs font-mono text-muted-foreground uppercase w-6 flex-shrink-0">
                            {lang.code}
                          </span>
                          <div className="flex-1">
                            <Input
                              placeholder={`${lang.name}...`}
                              value={translations[lang.code] || ""}
                              onChange={(e) =>
                                setTranslations({
                                  ...translations,
                                  [lang.code]: e.target.value,
                                })
                              }
                              className="text-sm h-9"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_required">{t("forms.required")}</Label>
                  <Switch
                    id="is_required"
                    checked={questionData.is_required}
                    onCheckedChange={(checked) =>
                      setQuestionData({ ...questionData, is_required: checked })
                    }
                  />
                </div>
                <Button
                  onClick={handleAddQuestion}
                  className="w-full"
                  disabled={!questionData.question_text}
                >
                  {editingQuestion ? t("forms.updateQuestion") : t("forms.addQuestion")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {questions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Type className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t("forms.noQuestionsYet")}</h3>
              <p className="text-muted-foreground text-center mb-4">
                {t("forms.addQuestionsHelp")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {questions.map((question, index) => (
              <Card key={question.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveQuestion(index, "up")}
                        disabled={index === 0}
                      >
                        <span className="text-xs">▲</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveQuestion(index, "down")}
                        disabled={index === questions.length - 1}
                      >
                        <span className="text-xs">▼</span>
                      </Button>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">
                            {index + 1}. {question.question_text}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {QUESTION_TYPE_ICONS[question.question_type]}
                              <span className="ml-1">
                                {QUESTION_TYPE_LABELS[question.question_type]}
                              </span>
                            </Badge>
                            {question.is_required && (
                              <Badge variant="secondary" className="text-xs">
                                {t("forms.required")}
                              </Badge>
                            )}
                            {Object.keys((question as any).translations || {}).filter(k => ((question as any).translations?.[k] || "").trim()).length > 0 && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Globe className="h-3 w-3" />
                                {Object.keys((question as any).translations).filter(k => ((question as any).translations[k] || "").trim()).length}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditQuestion(question)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteQuestion(question.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
