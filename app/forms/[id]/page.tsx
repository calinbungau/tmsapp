"use client";

import React from "react"

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import SignaturePad from "@/components/signature-pad";
import { useAndroidCamera } from "@/hooks/use-android-camera";
import { FullscreenCamera } from "@/components/driver/fullscreen-camera";
import type { FormTemplate, FormQuestion, QuestionType } from "@/lib/types";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface Answer {
  question_id: string;
  answer_text?: string;
  answer_boolean?: boolean;
  answer_number?: number;
  answer_photo_url?: string;
  answer_photo_urls?: string[]; // For multiple photos
}

interface CurrentSubmission {
  id: string;
  form_id: string;
  vehicle_id: string;
  admin_id: string;
}

export default function FormSubmissionPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [submission, setSubmission] = useState<CurrentSubmission | null>(null);
  const [form, setForm] = useState<FormTemplate | null>(null);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [driverLang, setDriverLang] = useState("en");

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }

    const driverData = JSON.parse(session);
    setDriver(driverData);
    
    // Read driver's preferred language
    const lang = localStorage.getItem("driver_language") || "en";
    setDriverLang(lang);
    
    // Get the current submission from localStorage
    const submissionSession = localStorage.getItem("current_submission");
    if (submissionSession) {
      setSubmission(JSON.parse(submissionSession));
    }

    // Get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (err) => console.error("Geolocation error:", err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    fetchForm();
  }, [id, router]);

  const fetchForm = async () => {
    const supabase = createClient();

    const { data: formData, error: formError } = await supabase
      .from("form_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (formError || !formData) {
      router.push("/forms");
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

  const currentQuestion = questions[currentStep];

  // Get translated question text based on driver's language
  const getQuestionText = (question: FormQuestion): string => {
    if (driverLang === "en") return question.question_text;
    const translations = (question as any).translations as Record<string, string> | null;
    if (translations && translations[driverLang]?.trim()) {
      return translations[driverLang];
    }
    return question.question_text; // Fallback to default
  };

  const handleAnswerChange = (value: Answer) => {
    if (!currentQuestion) return;
    setAnswers({
      ...answers,
      [currentQuestion.id]: { ...value, question_id: currentQuestion.id },
    });
  };

  const getMaxPhotos = () => {
    if (!currentQuestion || currentQuestion.question_type !== "photo") return 1;
    return (currentQuestion.options as { max_photos?: number })?.max_photos || 1;
  };

  const handlePhotoCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCameraError(null);

    // Check if the file was taken with camera (checking for recent timestamp)
    const fileDate = new Date(file.lastModified);
    const now = new Date();
    const diffMinutes = (now.getTime() - fileDate.getTime()) / (1000 * 60);
    
    // If the file is older than 5 minutes, it's likely from gallery
    if (diffMinutes > 5) {
      setCameraError("Please use the camera to take a new photo");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const maxPhotos = getMaxPhotos();
      
      if (maxPhotos === 1) {
        // Single photo mode
        handleAnswerChange({ question_id: currentQuestion.id, answer_photo_url: dataUrl });
      } else {
        // Multiple photos mode
        const currentPhotos = answers[currentQuestion.id]?.answer_photo_urls || [];
        handleAnswerChange({ 
          question_id: currentQuestion.id, 
          answer_photo_urls: [...currentPhotos, dataUrl] 
        });
      }
    };
    reader.readAsDataURL(file);
    
    // Reset file input for next capture
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Process a File directly (used by Android camera hook)
  const processPhotoFile = (file: File) => {
    setCameraError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const q = questions[currentStep];
      if (!q) return;
      const maxPhotos = getMaxPhotos();
      if (maxPhotos === 1) {
        handleAnswerChange({ question_id: q.id, answer_photo_url: dataUrl });
      } else {
        const currentPhotos = answers[q.id]?.answer_photo_urls || [];
        handleAnswerChange({ question_id: q.id, answer_photo_urls: [...currentPhotos, dataUrl] });
      }
    };
    reader.readAsDataURL(file);
  };

  const androidCamera = useAndroidCamera(processPhotoFile);

  const handleOpenCamera = async () => {
    setCameraError(null);
    const handled = await androidCamera.openCamera();
    if (!handled) {
      fileInputRef.current?.click();
    }
  };

  const handleClearPhoto = (index?: number) => {
    const maxPhotos = getMaxPhotos();
    
    if (maxPhotos === 1 || index === undefined) {
      // Single photo mode - clear the photo
      handleAnswerChange({ question_id: currentQuestion.id, answer_photo_url: undefined, answer_photo_urls: undefined });
    } else {
      // Multiple photos mode - remove specific photo
      const currentPhotos = answers[currentQuestion.id]?.answer_photo_urls || [];
      const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
      handleAnswerChange({ question_id: currentQuestion.id, answer_photo_urls: updatedPhotos });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const canProceed = () => {
    if (!currentQuestion) return true;
    if (!currentQuestion.is_required) return true;

    const answer = answers[currentQuestion.id];
    if (!answer) return false;

    switch (currentQuestion.question_type) {
      case "yes_no":
        return answer.answer_boolean !== undefined;
      case "photo":
        // Check both single photo and multiple photos
        const maxPhotos = (currentQuestion.options as { max_photos?: number })?.max_photos || 1;
        if (maxPhotos === 1) {
          return !!answer.answer_photo_url;
        } else {
          return answer.answer_photo_urls && answer.answer_photo_urls.length > 0;
        }
      case "text":
        return !!answer.answer_text?.trim();
      case "number":
        return answer.answer_number !== undefined;
      case "signature":
        return !!answer.answer_photo_url;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
      setCapturedPhoto(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      const prevQuestion = questions[currentStep - 1];
      if (prevQuestion?.question_type === "photo") {
        setCapturedPhoto(answers[prevQuestion.id]?.answer_photo_url || null);
      }
    }
  };

  const handleSubmit = async () => {
    if (!driver || !form) return;
    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();
      
      let submissionId: string;
      
      // Check if we have an existing submission from select-vehicle flow
      if (submission?.id) {
        submissionId = submission.id;
        
        // Update the existing submission
        const { error: updateError } = await supabase
          .from("form_submissions")
          .update({
            status: "completed",
            latitude: location?.latitude || null,
            longitude: location?.longitude || null,
            location_accuracy: location?.accuracy || null,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", submissionId);
          
        if (updateError) throw new Error("Failed to update submission");
      } else {
        // Create new submission (for direct access without vehicle selection)
        const { data: newSubmission, error: submissionError } = await supabase
          .from("form_submissions")
          .insert({
            form_template_id: form.id,
            driver_id: driver.id,
            admin_id: driver.admin_id,
            status: "completed",
            latitude: location?.latitude || null,
            longitude: location?.longitude || null,
            location_accuracy: location?.accuracy || null,
            submitted_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (submissionError || !newSubmission) {
          throw new Error("Failed to create submission");
        }
        submissionId = newSubmission.id;
      }

      // Upload photos and create answers
      for (const question of questions) {
        const answer = answers[question.id];
        if (!answer) continue;

        let photoUrl: string | null = null;
        let photoUrls: string[] = [];

        // Upload photo(s) if needed
        if (question.question_type === "photo" || question.question_type === "signature") {
          const maxPhotos = (question.options as { max_photos?: number })?.max_photos || 1;
          
          if (maxPhotos === 1 && answer.answer_photo_url?.startsWith("data:")) {
            // Single photo upload
            const base64 = answer.answer_photo_url.split(",")[1];
            const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const blob = new Blob([byteArray], { type: "image/jpeg" });
            
            const fileName = `${driver.admin_id}/${submissionId}/${question.id}_${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage
              .from("inspection-photos")
              .upload(fileName, blob, { contentType: "image/jpeg" });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from("inspection-photos")
                .getPublicUrl(fileName);
              photoUrl = urlData.publicUrl;
            }
          } else if (maxPhotos > 1 && answer.answer_photo_urls && answer.answer_photo_urls.length > 0) {
            // Multiple photos upload
            for (let i = 0; i < answer.answer_photo_urls.length; i++) {
              const photo = answer.answer_photo_urls[i];
              if (photo.startsWith("data:")) {
                const base64 = photo.split(",")[1];
                const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
                const blob = new Blob([byteArray], { type: "image/jpeg" });
                
                const fileName = `${driver.admin_id}/${submissionId}/${question.id}_${i}_${Date.now()}.jpg`;
                const { error: uploadError } = await supabase.storage
                  .from("inspection-photos")
                  .upload(fileName, blob, { contentType: "image/jpeg" });

                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from("inspection-photos")
                    .getPublicUrl(fileName);
                  photoUrls.push(urlData.publicUrl);
                }
              }
            }
            // Store all URLs as JSON in answer_photo_url
            if (photoUrls.length > 0) {
              photoUrl = JSON.stringify(photoUrls);
            }
          }
        }

        // Create answer
        await supabase.from("form_answers").insert({
          submission_id: submissionId,
          question_id: question.id,
          answer_text: answer.answer_text || null,
          answer_boolean: answer.answer_boolean ?? null,
          answer_number: answer.answer_number ?? null,
          answer_photo_url: photoUrl || null,
        });
      }

      // Clean up localStorage
      localStorage.removeItem("current_submission");
      localStorage.removeItem("selected_form");
      
      router.push("/driver-dashboard?success=true");
    } catch (err) {
      setError("Failed to submit form. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" size="icon" onClick={() => router.push("/forms")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{form.name}</h1>
            <p className="text-xs text-muted-foreground">
              Question {currentStep + 1} of {questions.length}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {questions.map((_, index) => (
            <div
              key={index}
              className={`flex-1 h-2 rounded-full transition-colors ${
                index < currentStep
                  ? "bg-primary"
                  : index === currentStep
                    ? "bg-primary/50"
                    : "bg-border"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Question */}
        {currentQuestion && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <Label className="text-lg font-medium block mb-4">
                {getQuestionText(currentQuestion)}
                {currentQuestion.is_required && (
                  <span className="text-red-400 ml-1">*</span>
                )}
              </Label>

              {/* Yes/No */}
              {currentQuestion.question_type === "yes_no" && (
                <div className="flex gap-4">
                  <Button
                    variant={answers[currentQuestion.id]?.answer_boolean === true ? "default" : "outline"}
                    className="flex-1 h-16"
                    onClick={() => handleAnswerChange({ question_id: currentQuestion.id, answer_boolean: true })}
                  >
                    <Check className="h-6 w-6 mr-2" />
                    Yes
                  </Button>
                  <Button
                    variant={answers[currentQuestion.id]?.answer_boolean === false ? "default" : "outline"}
                    className="flex-1 h-16"
                    onClick={() => handleAnswerChange({ question_id: currentQuestion.id, answer_boolean: false })}
                  >
                    <X className="h-6 w-6 mr-2" />
                    No
                  </Button>
                </div>
              )}

              {/* Photo */}
              {currentQuestion.question_type === "photo" && (
                <div>
                  {/* Hidden file input with capture attribute to force camera */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoCapture}
                  />
                  
                  {cameraError && (
                  <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
                  {cameraError}
                  </div>
                  )}

                  {/* Android fullscreen camera */}
                  {androidCamera.cameraActive && (
                    <FullscreenCamera
                      videoRef={androidCamera.videoRef}
                      canvasRef={androidCamera.canvasRef}
                      onCapture={androidCamera.capturePhoto}
                      onCancel={androidCamera.stopCamera}
                    />
                  )}
                  
                  {(() => {
                    const maxPhotos = getMaxPhotos();
                    const currentPhotos = answers[currentQuestion.id]?.answer_photo_urls || [];
                    const singlePhoto = answers[currentQuestion.id]?.answer_photo_url;
                    
                    if (maxPhotos === 1) {
                      // Single photo mode
                      return singlePhoto ? (
                        <div className="relative">
                          <img
                            src={singlePhoto || "/placeholder.svg"}
                            alt="Captured"
                            className="w-full rounded-lg aspect-[4/3] object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2"
                            onClick={() => handleClearPhoto()}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <div className="absolute bottom-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-sm flex items-center gap-1">
                            <Check className="h-4 w-4" />
                            Captured
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={handleOpenCamera}
                          className="border-2 border-dashed border-primary/30 rounded-lg aspect-[4/3] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/60 transition-colors bg-card"
                        >
                          <Camera className="h-12 w-12 text-primary" />
                          <p className="text-sm text-foreground/70">Tap to take photo</p>
                        </div>
                      );
                    }
                    
                    // Multiple photos mode
                    return (
                      <div className="space-y-4">
                        <div className="text-sm text-muted-foreground mb-2">
                          {currentPhotos.length} / {maxPhotos} photos
                        </div>
                        
                        {/* Photo grid */}
                        {currentPhotos.length > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            {currentPhotos.map((photo, index) => (
                              <div key={index} className="relative aspect-[4/3]">
                                <img
                                  src={photo || "/placeholder.svg"}
                                  alt={`Photo ${index + 1}`}
                                  className="w-full h-full rounded-lg object-cover"
                                />
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 h-6 w-6"
                                  onClick={() => handleClearPhoto(index)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                                <div className="absolute bottom-1 left-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-xs">
                                  {index + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Add more photos button */}
                        {currentPhotos.length < maxPhotos && (
                          <div
                            onClick={handleOpenCamera}
                            className="border-2 border-dashed border-primary/30 rounded-lg aspect-[4/3] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/60 transition-colors bg-card"
                          >
                            <Camera className="h-12 w-12 text-primary" />
                            <p className="text-sm text-foreground/70">
                              {currentPhotos.length === 0 
                                ? "Tap to take photo" 
                                : `Add another photo (${maxPhotos - currentPhotos.length} remaining)`}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Text */}
              {currentQuestion.question_type === "text" && (
                <Textarea
                  value={answers[currentQuestion.id]?.answer_text || ""}
                  onChange={(e) =>
                    handleAnswerChange({ question_id: currentQuestion.id, answer_text: e.target.value })
                  }
                  placeholder="Enter your answer..."
                  rows={4}
                />
              )}

              {/* Number */}
              {currentQuestion.question_type === "number" && (
                <Input
                  type="number"
                  value={answers[currentQuestion.id]?.answer_number ?? ""}
                  onChange={(e) =>
                    handleAnswerChange({
                      question_id: currentQuestion.id,
                      answer_number: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  placeholder="Enter a number..."
                  className="text-lg h-14"
                />
              )}

              {/* Signature */}
              {currentQuestion.question_type === "signature" && (
                <SignaturePad
                  onSave={(dataUrl) =>
                    handleAnswerChange({ question_id: currentQuestion.id, answer_photo_url: dataUrl })
                  }
                  savedSignature={answers[currentQuestion.id]?.answer_photo_url}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex gap-4">
          {currentStep > 0 && (
            <Button variant="outline" onClick={handleBack} className="flex-1 bg-transparent">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          {currentStep < questions.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()} className="flex-1">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="flex-1"
            >
              {submitting ? "Submitting..." : "Submit"}
              <Check className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
