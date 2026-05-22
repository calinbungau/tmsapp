"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  MapPin, 
  FileText,
  Check,
  X
} from "lucide-react";
import type { FormSubmission, FormTemplate, FormQuestion, FormAnswer, Driver, Vehicle } from "@/lib/types";
import { FORM_FREQUENCY_LABELS, QUESTION_TYPE_LABELS } from "@/lib/types";

interface SubmissionDetail extends FormSubmission {
  form_template: FormTemplate & { questions: FormQuestion[] };
  driver: Driver;
  vehicle: Vehicle | null;
  answers: (FormAnswer & { question: FormQuestion })[];
}

export default function SubmissionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmission();
  }, [id]);

  const fetchSubmission = async () => {
    setLoading(true);
    const supabase = createClient();

    // Fetch submission with all related data
    const { data, error } = await supabase
      .from("form_submissions")
      .select(`
        *,
        form_template:form_templates(
          *,
          questions:form_questions(*)
        ),
        driver:drivers(*),
        vehicle:vehicles(*),
        answers:form_answers(
          *,
          question:form_questions(*)
        )
      `)
      .eq("id", id)
      .single();

    if (!error && data) {
      // Sort questions and answers by order_index
      if (data.form_template?.questions) {
        data.form_template.questions.sort((a: FormQuestion, b: FormQuestion) => a.order_index - b.order_index);
      }
      if (data.answers) {
        data.answers.sort((a: FormAnswer & { question: FormQuestion }, b: FormAnswer & { question: FormQuestion }) => 
          (a.question?.order_index || 0) - (b.question?.order_index || 0)
        );
      }
      setSubmission(data as SubmissionDetail);
    }

    setLoading(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    return status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400";
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case "daily": return "bg-blue-500/20 text-blue-400";
      case "weekly": return "bg-purple-500/20 text-purple-400";
      case "monthly": return "bg-orange-500/20 text-orange-400";
      case "on_demand": return "bg-primary/20 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const renderAnswer = (question: FormQuestion, answer?: FormAnswer) => {
    if (!answer) {
      return <span className="text-muted-foreground italic">No answer</span>;
    }

    switch (question.question_type) {
      case "yes_no":
        return answer.answer_boolean !== null ? (
          <div className={`flex items-center gap-2 ${answer.answer_boolean ? "text-green-400" : "text-red-400"}`}>
            {answer.answer_boolean ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
            <span className="font-medium">{answer.answer_boolean ? "Yes" : "No"}</span>
          </div>
        ) : (
          <span className="text-muted-foreground italic">No answer</span>
        );

      case "photo":
        if (!answer.answer_photo_url) {
          return <span className="text-muted-foreground italic">No photo</span>;
        }
        
        // Check if it's multiple photos (JSON array)
        try {
          const photos = JSON.parse(answer.answer_photo_url);
          if (Array.isArray(photos) && photos.length > 0) {
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {photos.map((photo: string, index: number) => (
                  <div 
                    key={index}
                    className="relative cursor-pointer aspect-[4/3]"
                    onClick={() => setSelectedImage(photo)}
                  >
                    <img
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full rounded-lg border object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm">Click to enlarge</span>
                    </div>
                    <div className="absolute bottom-1 left-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-xs">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
        } catch {
          // Not JSON, single photo URL
        }
        
        // Single photo
        return (
          <div 
            className="relative cursor-pointer inline-block"
            onClick={() => setSelectedImage(answer.answer_photo_url)}
          >
            <img
              src={answer.answer_photo_url}
              alt="Submitted photo"
              className="w-full max-w-md rounded-lg border object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">Click to enlarge</span>
            </div>
          </div>
        );

      case "text":
        return answer.answer_text ? (
          <p className="text-foreground">{answer.answer_text}</p>
        ) : (
          <span className="text-muted-foreground italic">No text</span>
        );

      case "number":
        return answer.answer_number !== null ? (
          <span className="font-medium text-foreground">{answer.answer_number}</span>
        ) : (
          <span className="text-muted-foreground italic">No number</span>
        );

      case "signature":
        return answer.answer_photo_url ? (
          <div 
            className="relative cursor-pointer bg-white rounded-lg p-2 inline-block"
            onClick={() => setSelectedImage(answer.answer_photo_url)}
          >
            <img
              src={answer.answer_photo_url}
              alt="Signature"
              className="max-w-xs"
            />
          </div>
        ) : (
          <span className="text-muted-foreground italic">No signature</span>
        );

      default:
        return <span className="text-muted-foreground italic">Unknown type</span>;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading submission...</div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Submission not found</p>
        <Button onClick={() => router.push("/admin/forms")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Forms
        </Button>
      </div>
    );
  }

  // Create a map of answers by question ID for easy lookup
  const answersByQuestionId = new Map(
    submission.answers?.map((a) => [a.question_id, a]) || []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{submission.form_template?.name}</h1>
            <Badge className={getFrequencyColor(submission.form_template?.frequency || "")}>
              {FORM_FREQUENCY_LABELS[submission.form_template?.frequency as keyof typeof FORM_FREQUENCY_LABELS]}
            </Badge>
            <Badge className={getStatusColor(submission.status)}>
              {submission.status === "completed" ? "Completed" : "In Progress"}
            </Badge>
          </div>
          <p className="text-muted-foreground">{submission.form_template?.description}</p>
        </div>
      </div>

      {/* Submission Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Driver</p>
              <p className="font-medium">{submission.driver?.name}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Submitted</p>
              <p className="font-medium">{formatDate(submission.submitted_at || submission.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        {submission.vehicle && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vehicle</p>
                <p className="font-medium">{submission.vehicle.plate_number}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {submission.latitude && submission.longitude && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <a 
                  href={`https://www.google.com/maps?q=${submission.latitude},${submission.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  View on Map
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Answers */}
      <Card>
        <CardHeader>
          <CardTitle>Responses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {submission.form_template?.questions?.map((question, index) => {
            const answer = answersByQuestionId.get(question.id);
            return (
              <div key={question.id} className="border-b border-border pb-6 last:border-0 last:pb-0">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{question.question_text}</p>
                      <Badge variant="outline" className="text-xs">
                        {QUESTION_TYPE_LABELS[question.question_type as keyof typeof QUESTION_TYPE_LABELS]}
                      </Badge>
                      {question.is_required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      {renderAnswer(question, answer)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:text-white"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-6 w-6" />
            </Button>
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
