import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { to, subject, body: emailBody, attachment, stampPosition, signaturePosition, emailId } = body;

    if (!to || !attachment?.content) {
      return NextResponse.json({ error: "To and attachment are required" }, { status: 400 });
    }

    // 1. Get company profile (stamp + signature)
    const { data: company } = await supabase
      .from("company_profiles")
      .select("stamp_url, signature_url, company_name")
      .eq("admin_id", adminId)
      .single();

    // 2. Get SMTP settings
    const { data: settings } = await supabase
      .from("user_email_settings")
      .select("*")
      .eq("admin_id", adminId)
      .single();

    if (!settings) {
      return NextResponse.json({ error: "Email settings not configured. Go to Email > Settings to set up SMTP." }, { status: 400 });
    }

    // 3. Process the document - overlay stamp + signature on PDF
    let finalAttachmentBuffer: Buffer;
    let finalFilename = attachment.filename;
    const rawBuffer = Buffer.from(attachment.content, "base64");

    if (attachment.contentType?.includes("pdf")) {
      // Load the PDF
      const pdfDoc = await PDFDocument.load(rawBuffer);
      const pages = pdfDoc.getPages();

      // Overlay stamp at user-specified position (page-specific)
      if (company?.stamp_url && stampPosition) {
        try {
          const stampRes = await fetch(company.stamp_url);
          const stampBytes = new Uint8Array(await stampRes.arrayBuffer());
          const stampImage = company.stamp_url.toLowerCase().includes(".png")
            ? await pdfDoc.embedPng(stampBytes)
            : await pdfDoc.embedJpg(stampBytes);

          // stampPosition: { x, y (%), page (0-indexed) }
          const targetPage = pages[stampPosition.page] ?? pages[pages.length - 1];
          const { width: pw, height: ph } = targetPage.getSize();
          const stampW = 120;
          const stampH = (stampImage.height / stampImage.width) * stampW;
          const pdfX = (stampPosition.x / 100) * pw - stampW / 2;
          const pdfY = ph - (stampPosition.y / 100) * ph - stampH / 2;

          targetPage.drawImage(stampImage, {
            x: Math.max(0, Math.min(pdfX, pw - stampW)),
            y: Math.max(0, Math.min(pdfY, ph - stampH)),
            width: stampW,
            height: stampH,
            opacity: 0.85,
          });
        } catch (e) {
          console.error("Failed to embed stamp:", e);
        }
      }

      // Overlay signature at user-specified position (page-specific)
      if (company?.signature_url && signaturePosition) {
        try {
          const sigRes = await fetch(company.signature_url);
          const sigBytes = new Uint8Array(await sigRes.arrayBuffer());
          const sigImage = company.signature_url.toLowerCase().includes(".png")
            ? await pdfDoc.embedPng(sigBytes)
            : await pdfDoc.embedJpg(sigBytes);

          const targetPage = pages[signaturePosition.page] ?? pages[pages.length - 1];
          const { width: pw, height: ph } = targetPage.getSize();
          const sigW = 100;
          const sigH = (sigImage.height / sigImage.width) * sigW;
          const pdfX = (signaturePosition.x / 100) * pw - sigW / 2;
          const pdfY = ph - (signaturePosition.y / 100) * ph - sigH / 2;

          targetPage.drawImage(sigImage, {
            x: Math.max(0, Math.min(pdfX, pw - sigW)),
            y: Math.max(0, Math.min(pdfY, ph - sigH)),
            width: sigW,
            height: sigH,
            opacity: 0.9,
          });
        } catch (e) {
          console.error("Failed to embed signature:", e);
        }
      }

      const signedPdfBytes = await pdfDoc.save();
      finalAttachmentBuffer = Buffer.from(signedPdfBytes);
      // Prefix filename with "Signed_"
      if (!finalFilename.startsWith("Signed_")) {
        finalFilename = `Signed_${finalFilename}`;
      }
    } else {
      // For non-PDF (images), just send as-is
      finalAttachmentBuffer = rawBuffer;
    }

    // 4. Send via SMTP
    const smtpPassword = decrypt(settings.smtp_password_encrypted);
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: {
        user: settings.smtp_user,
        pass: smtpPassword,
      },
    });

    const fromAddress = settings.display_name
      ? `"${settings.display_name}" <${settings.email_address}>`
      : settings.email_address;

    await transporter.sendMail({
      from: fromAddress,
      to,
      subject: subject || `Signed: ${attachment.filename}`,
      html: `<p>${(emailBody || "Please find the signed document attached.").replace(/\n/g, "<br>")}</p>` +
        (settings.signature_html ? `<br>${settings.signature_html}` : ""),
      attachments: [
        {
          filename: finalFilename,
          content: finalAttachmentBuffer,
          contentType: attachment.contentType || "application/pdf",
        },
      ],
    });

    // 5. Store signed PDF in Supabase Storage and update email record
    let signedDocumentUrl: string | null = null;
    try {
      const storagePath = `signed-documents/${adminId}/${Date.now()}_${finalFilename}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, finalAttachmentBuffer, {
          contentType: attachment.contentType || "application/pdf",
          upsert: false,
        });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);
        signedDocumentUrl = urlData?.publicUrl || null;
      }

      // Update the email record with signed document info
      if (emailId && signedDocumentUrl) {
        await supabase
          .from("user_emails")
          .update({
            signed_document_url: signedDocumentUrl,
            signed_at: new Date().toISOString(),
            signed_filename: finalFilename,
          })
          .eq("id", emailId);
      }
    } catch (storageErr) {
      console.error("Failed to store signed document (email still sent):", storageErr);
    }

    return NextResponse.json({
      success: true,
      message: `Signed document sent to ${to}`,
      signed_document_url: signedDocumentUrl,
      signed_filename: finalFilename,
    });
  } catch (error: any) {
    console.error("Sign and send error:", error);
    return NextResponse.json({ error: error.message || "Failed to sign and send" }, { status: 500 });
  }
}
