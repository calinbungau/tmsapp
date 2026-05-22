import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, test_email, from_email, from_name } = body;

    if (!smtp_host || !smtp_user || !smtp_password) {
      return NextResponse.json({ success: false, error: "Missing required SMTP settings" }, { status: 400 });
    }

    // Create transporter with same config as working email implementation
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: smtp_port || 587,
      secure: smtp_secure ?? (smtp_port === 465),
      auth: {
        user: smtp_user,
        pass: smtp_password,
      },
    });

    // Verify connection
    await transporter.verify();

    // If test_email provided, send actual test
    if (test_email) {
      await transporter.sendMail({
        from: from_email ? `"${from_name || 'System'}" <${from_email}>` : smtp_user,
        to: test_email,
        subject: "BNG Tracking - System Email Test",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #22c55e; margin-bottom: 16px;">Connection Successful!</h2>
            <p style="color: #333; margin-bottom: 12px;">Your system email configuration is working correctly.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">
              This is a test email from BNG Tracking system email configuration.<br/>
              Sent at: ${new Date().toLocaleString()}
            </p>
          </div>
        `,
        text: "System Email Test - Your configuration is working correctly.",
      });

      return NextResponse.json({ 
        success: true, 
        message: "Test email sent successfully!" 
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Connection verified successfully!" 
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Connection test failed";
    console.error("[SystemEmail] Test connection error:", error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
