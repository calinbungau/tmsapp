import { createClient } from "@supabase/supabase-js";
import { decrypt } from "./encryption";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SystemEmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
}

/**
 * Get system email settings for an admin
 */
export async function getSystemEmailSettings(adminId: string): Promise<SystemEmailSettings | null> {
  const { data, error } = await supabase
    .from("system_email_settings")
    .select("*")
    .eq("admin_id", adminId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // Decrypt password
  let password = "";
  if (data.smtp_password_encrypted) {
    try {
      password = decrypt(data.smtp_password_encrypted);
    } catch (e) {
      console.error("[SystemEmail] Failed to decrypt password:", e);
    }
  }

  return {
    smtp_host: data.smtp_host,
    smtp_port: data.smtp_port,
    smtp_secure: data.smtp_secure,
    smtp_user: data.smtp_user,
    smtp_password: password,
    // The DB column is `email_address` / `display_name`. Older rows
    // may still carry `from_email` / `from_name`, so we fall back to
    // those for backwards compatibility.
    from_email: data.email_address ?? data.from_email ?? "",
    from_name: data.display_name ?? data.from_name ?? "",
    is_active: data.is_active,
  };
}

export interface SendSystemEmailOptions {
  adminId: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SendSystemEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send email using system email settings
 * This function dynamically imports nodemailer to avoid edge runtime issues
 */
export async function sendSystemEmail(options: SendSystemEmailOptions): Promise<SendSystemEmailResult> {
  const { adminId, to, subject, html, text, attachments } = options;

  // Get settings
  const settings = await getSystemEmailSettings(adminId);
  if (!settings || !settings.is_active) {
    return { 
      success: false, 
      error: "System email not configured. Please configure it in Settings > System Email." 
    };
  }

  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
    return { 
      success: false, 
      error: "Incomplete system email configuration." 
    };
  }

  try {
    // Dynamic import to avoid edge runtime issues
    const nodemailer = await import("nodemailer");
    
    const transporter = nodemailer.default.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password,
      },
    });

    const fromAddress = settings.from_email 
      ? `"${settings.from_name || 'System'}" <${settings.from_email}>`
      : settings.smtp_user;

    const recipients = Array.isArray(to) ? to : [to];

    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(", "),
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return { 
      success: true, 
      messageId: info.messageId 
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to send email";
    console.error("[SystemEmail] Send error:", error);
    return { success: false, error };
  }
}
