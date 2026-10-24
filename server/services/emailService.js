// Email Service for OTP
const nodemailer = require('nodemailer');
// Environment variables are loaded once, by server.js.
const { buildFeeReminderEmail } = require('./feeReminderEmail');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isInitialized = false;
    this.config = this.loadEmailConfig();
    this.initializeTransporter();
  }

  // Load email configuration from environment variables
  loadEmailConfig() {
    try {
      const config = {
        EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'gmail',
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_PASS: process.env.EMAIL_PASS,
        EMAIL_FROM: process.env.EMAIL_FROM || 'Core5 Academy <support@core5.co.in>'
      };
      
      console.log('✅ Email configuration loaded from environment variables');
      return config;
    } catch (error) {
      console.log('❌ Error loading email config:', error.message);
      return this.getFallbackConfig();
    }
  }

  // Get fallback configuration
  getFallbackConfig() {
    return {
      EMAIL_SERVICE: 'gmail',
      EMAIL_USER: 'noreply@core5academy.com',
      EMAIL_PASS: 'fallback-password',
      EMAIL_FROM: 'Core5 Academy <support@core5.co.in>'
    };
  }

  // Initialize email transporter
  async initializeTransporter() {
    // Tests and local checks: keep every message in memory, never contact a mail server.
    if (process.env.EMAIL_TRANSPORT === 'mock') {
      this.outbox = [];
      this.transporter = {
        verify: async () => true,
        sendMail: async (mailOptions) => {
          this.outbox.push(mailOptions);
          return { messageId: `mock-${this.outbox.length}` };
        }
      };
      this.isInitialized = true;
      return;
    }

    try {
      // Check if we have real email credentials
      if (this.config.EMAIL_USER && this.config.EMAIL_PASS && 
          this.config.EMAIL_USER !== 'noreply@core5academy.com' &&
          this.config.EMAIL_PASS !== 'fallback-password') {
        
        let transporterConfig;
        
        // Configure based on email service
        if (this.config.EMAIL_SERVICE === 'zoho') {
          // Try multiple Zoho Mail SMTP configurations
          const zohoConfigs = [
            {
              // Zoho with SSL (port 465)
              host: 'smtp.zoho.com',
              port: 465,
              secure: true,
              auth: {
                user: this.config.EMAIL_USER,
                pass: this.config.EMAIL_PASS
              }
            },
            {
              // Zoho with TLS (port 587)
              host: 'smtp.zoho.com',
              port: 587,
              secure: false,
              requireTLS: true,
              auth: {
                user: this.config.EMAIL_USER,
                pass: this.config.EMAIL_PASS
              }
            },
            {
              // Zoho alternative configuration
              host: 'smtp.zoho.in',
              port: 465,
              secure: true,
              auth: {
                user: this.config.EMAIL_USER,
                pass: this.config.EMAIL_PASS
              }
            }
          ];

          // Try each configuration
          for (let i = 0; i < zohoConfigs.length; i++) {
            try {
              console.log(`🔄 Trying Zoho config ${i + 1}: ${zohoConfigs[i].host}:${zohoConfigs[i].port}`);
              this.transporter = nodemailer.createTransport(zohoConfigs[i]);
              await this.transporter.verify();
              console.log(`✅ Zoho config ${i + 1} successful!`);
              transporterConfig = zohoConfigs[i];
              break;
            } catch (error) {
              console.log(`❌ Zoho config ${i + 1} failed:`, error.message);
              if (i === zohoConfigs.length - 1) {
                throw error; // Re-throw if all configs fail
              }
            }
          }
        } else if (this.config.EMAIL_SERVICE === 'gmail') {
          // Gmail SMTP configuration
          transporterConfig = {
            service: 'gmail',
            auth: {
              user: this.config.EMAIL_USER,
              pass: this.config.EMAIL_PASS
            }
          };
        } else {
          // Default/other service
          transporterConfig = {
            service: this.config.EMAIL_SERVICE || 'gmail',
            auth: {
              user: this.config.EMAIL_USER,
              pass: this.config.EMAIL_PASS
            }
          };
        }

        // Create transporter with successful config (if not already created)
        if (this.config.EMAIL_SERVICE !== 'zoho' || !this.transporter) {
          this.transporter = nodemailer.createTransport(transporterConfig);
        }

        // Test the connection
        await this.transporter.verify();
        this.isInitialized = true;
        
        console.log(`✅ Real email service initialized with ${this.config.EMAIL_SERVICE.toUpperCase()} SMTP`);
        console.log(`📧 Sending from: ${this.config.EMAIL_USER}`);
        console.log('🔒 Credentials loaded from secure .env file');
        
      } else {
        // Ethereal is a public test mailbox run by a third party. It is acceptable on a
        // developer machine only: real reset codes must never be sent there.
        if (process.env.NODE_ENV !== 'development') {
          console.warn('⚠️  No email credentials configured: emails will not be sent.');
          this.isInitialized = false;
          return;
        }
        console.log('⚠️  No email credentials found in .env, using test service');
        const account = await nodemailer.createTestAccount();
        
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: account.user,
            pass: account.pass
          }
        });

        this.isInitialized = true;
        console.log('✅ Fallback email service initialized with Ethereal');
        console.log(`📧 Test email URL: https://ethereal.email/messages`);
      }
      
    } catch (error) {
      console.log('❌ Email service initialization failed:', error.message);
      console.log('🔄 Falling back to mock service');
      this.isInitialized = false;
    }
  }

  // Send OTP email
  async sendOTPEmail(email, otp) {
    try {
      // Wait for initialization if not ready
      if (!this.isInitialized && this.transporter === null) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for init
      }

      // If transporter is still not available, fallback to mock
      if (!this.transporter) {
        return this.sendMockOTPEmail(email, otp);
      }

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Core5 Academy</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Password Reset OTP</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; text-align: center; margin-bottom: 20px; font-size: 24px;">Your OTP Code</h2>
            <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; text-align: center; border: 2px dashed #667eea; margin: 20px 0;">
              <span style="font-size: 42px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: monospace;">${otp}</span>
            </div>
            <p style="color: #666; text-align: center; margin-top: 20px; font-size: 16px;">
              This OTP will expire in <strong style="color: #e74c3c;">10 minutes</strong>
            </p>
            <p style="color: #999; text-align: center; margin-top: 10px; font-size: 14px;">
              Requested at: ${new Date().toLocaleString()}
            </p>
          </div>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 10px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
              <strong>🔒 Security Notice:</strong> Never share this OTP with anyone. Our team will never ask for your OTP via phone or email. This code can only be used once.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              This is an automated message from Core5 Academy LMS System.<br>
              If you didn't request this password reset, please ignore this email.
            </p>
            <p style="color: #999; margin: 10px 0 0; font-size: 11px;">
              © 2024 Core5 Academy. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: this.config.EMAIL_FROM || '"Core5 Academy" <support@core5.co.in>',
        to: email,
        subject: '🔐 Password Reset OTP - Core5 Academy',
        html: htmlContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      console.log('📧 ===== OTP EMAIL SENT =====');
      console.log(`📬 To: ${email}`);
      console.log(`📋 Message ID: ${info.messageId}`);
      
      // Show different info based on email service
      if (this.config.EMAIL_USER && this.config.EMAIL_USER !== 'noreply@core5academy.com') {
        console.log(`✅ Real email sent via secure ${this.config.EMAIL_SERVICE.toUpperCase()} SMTP`);
        console.log('📱 Check your email inbox for the OTP');
        console.log('🔒 Credentials loaded from secure .env file');
      } else {
        console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        console.log('⚠️  This is a test email service');
      }
      
      console.log('========================');

      return {
        success: true,
        message: 'OTP sent successfully',
        messageId: info.messageId,
        previewUrl: this.config.EMAIL_USER !== 'noreply@core5academy.com' ? null : nodemailer.getTestMessageUrl(info),
        emailService: this.config.EMAIL_USER !== 'noreply@core5academy.com' ? this.config.EMAIL_SERVICE : 'test-ethereal'
      };

    } catch (error) {
      console.error('❌ Error sending email:', error.message);
      return this.sendMockOTPEmail(email, otp);
    }
  }

  // Mock email service (fallback)
  async sendMockOTPEmail(email, otp) {
    try {
      console.log('📧 ===== MOCK OTP EMAIL SENT =====');
      console.log(`📬 To: ${email}`);
      console.log(`📋 Subject: Password Reset OTP`);
      if (process.env.NODE_ENV !== 'development') {
        console.error('❌ No working mail server is configured: the password reset code was NOT delivered.');
        return { success: false, message: 'Failed to send OTP' };
      }
      console.log(`📝 Message: Your OTP code is: ${otp}`);
      console.log(`⏰ This OTP will expire in 10 minutes.`);
      console.log('==================================');

      // Mock email sending delay
      await new Promise(resolve => setTimeout(resolve, 100));

      return {
        success: true,
        message: 'OTP sent successfully (mock service)',
        emailService: 'mock'
      };
    } catch (error) {
      console.error('❌ Error sending mock email:', error);
      return {
        success: false,
        message: 'Failed to send OTP',
        error: error.message
      };
    }
  }

  // Send New Demo Booking Alert to Admin / Sakshi
  async sendDemoNotificationEmail(demoData) {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'sakshi.mishra@core5.co.in';
    const { fullName, workEmail, institutionName, role, studentCount, preferredDate, preferredTime } = demoData;

    try {
      if (!this.isInitialized && this.transporter === null) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background-color: #f8fafc; color: #1e293b;">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #1e1b4b 0%, #2d296a 100%); padding: 32px 24px; text-align: center; border-top: 4px solid #B99652;">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Core5 Academy LMS</h1>
            <p style="color: #ebdcaa; margin: 8px 0 0; font-size: 15px; font-weight: 500;">🚀 New Enterprise Live Demo Request</p>
          </div>

          <!-- Main Details Card -->
          <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; margin-top: -8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 14px;">
              <span style="font-size: 18px; font-weight: 700; color: #1e1b4b;">Prospect Overview</span>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 600; color: #64748b; width: 38%;">Client Name:</td>
                <td style="padding: 10px 0; font-weight: 700; color: #0f172a;">${fullName || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Work Email:</td>
                <td style="padding: 10px 0; font-weight: 700; color: #1d528f;"><a href="mailto:${workEmail}" style="color: #1d528f; text-decoration: none;">${workEmail}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Institution / College:</td>
                <td style="padding: 10px 0; font-weight: 700; color: #0f172a;">${institutionName || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Designation / Role:</td>
                <td style="padding: 10px 0; font-weight: 600; color: #334155;">${role || 'Dean / Director'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Student Strength:</td>
                <td style="padding: 10px 0; font-weight: 600; color: #334155;">${studentCount || '1,000 - 5,000'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Requested Date:</td>
                <td style="padding: 10px 0; font-weight: 700; color: #B99652;">📅 ${preferredDate || 'Earliest Available'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Requested Time Slot:</td>
                <td style="padding: 10px 0; font-weight: 700; color: #B99652;">⏰ ${preferredTime || '10:00 AM'}</td>
              </tr>
            </table>

            <!-- Quick Action Button -->
            <div style="margin-top: 28px; text-align: center;">
              <a href="mailto:${workEmail}?subject=Re:%20Core5%20LMS%20Live%20Demo%20Session%20Confirmation&body=Dear%20${encodeURIComponent(fullName || 'Client')},%0D%0A%0D%0AThank%20you%20for%20requesting%20a%20walkthrough%20of%20Core5%20LMS.%20I%20would%20be%20delighted%20to%20host%20your%20demo%20on%20${encodeURIComponent(preferredDate || 'the requested date')}%20at%20${encodeURIComponent(preferredTime || '10:00 AM')}.%0D%0A%0D%0APlease%20let%20me%20know%20if%20you%20have%20any%20specific%20modules%20you%20would%20like%20to%20prioritize." 
                 style="display: inline-block; background-color: #1e1b4b; color: #ffffff; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; padding: 13px 28px; text-decoration: none; border-left: 3px solid #B99652;">
                Reply Directly to Client &rarr;
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
            <p style="margin: 0;">Automated Lead Notification | Core5 LMS Portal</p>
            <p style="margin: 4px 0 0;">Received on: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: this.config.EMAIL_FROM || '"Core5 Academy" <support@core5.co.in>',
        to: adminEmail,
        subject: `🚀 New Demo Request: ${institutionName || fullName} (${preferredDate || 'Upcoming'})`,
        html: htmlContent
      };

      if (this.transporter) {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`✅ [Demo Alert] Sent to Admin (${adminEmail}) - MsgID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } else {
        console.log(`⚠️ Transporter unavailable, mock notification logged for: ${adminEmail}`);
        return { success: true, mock: true };
      }
    } catch (error) {
      console.error('❌ Error sending demo notification email to admin:', error);
      return { success: false, error: error.message };
    }
  }

  // Send Confirmation Email to the Client who booked the demo
  async sendDemoConfirmationToClient(demoData) {
    const { fullName, workEmail, institutionName, preferredDate, preferredTime } = demoData;

    try {
      if (!this.isInitialized && this.transporter === null) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background-color: #f8fafc; color: #1e293b;">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #1e1b4b 0%, #2d296a 100%); padding: 32px 24px; text-align: center; border-top: 4px solid #B99652;">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">Core5 Academy</h1>
            <p style="color: #ebdcaa; margin: 8px 0 0; font-size: 15px; font-weight: 500;">Live Enterprise LMS Walkthrough</p>
          </div>

          <!-- Body Card -->
          <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; margin-top: -8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Dear ${fullName || 'Colleague'},</h2>
            
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Thank you for scheduling a live 1-on-1 walkthrough of <strong>Core5 Enterprise LMS</strong> for <strong>${institutionName || 'your institution'}</strong>.
            </p>

            <!-- Appointment Details Box -->
            <div style="background: #fdfbf7; border: 1px solid #ebdcaa; border-left: 4px solid #B99652; padding: 18px 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px; font-size: 14px; font-weight: 700; color: #1e1b4b; text-transform: uppercase; letter-spacing: 0.5px;">Your Requested Slot</h3>
              <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>Date:</strong> ${preferredDate || 'To be confirmed'}</p>
              <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>Time:</strong> ${preferredTime || '10:00 AM'}</p>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Our Enterprise Solutions Specialist is reviewing your institutional profile and will send a <strong>Google Meet invite</strong> directly to this email address shortly.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-size: 13px; font-weight: 600; color: #1e1b4b;">What you will explore in the demo:</p>
              <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
                <li>24/7 AI GuideBot & Student Onboarding automation</li>
                <li>Isolated multi-tenant course, classroom, & attendance management</li>
                <li>Lab inventory, vendor requisition, & institutional fee invoicing</li>
                <li>Real-time automated analytics & accreditation reporting</li>
              </ul>
            </div>

            <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
              Warm regards,<br>
              <strong>Enterprise Solutions Team</strong><br>
              Core5 Academy LMS (<a href="https://core5.co.in" style="color: #B99652; text-decoration: none;">core5.co.in</a>)
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Core5 Academy. All rights reserved.</p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: this.config.EMAIL_FROM || '"Core5 Academy" <support@core5.co.in>',
        to: workEmail,
        subject: `🎓 Your Core5 LMS Demo Request is Received (${institutionName || 'Live Walkthrough'})`,
        html: htmlContent
      };

      if (this.transporter) {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`✅ [Demo Confirmation] Sent to Client (${workEmail}) - MsgID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      }
      return { success: true, mock: true };
    } catch (error) {
      console.error('❌ Error sending demo confirmation to client:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send Fee Payment Reminder Email to Student.
   * Content is built (and HTML-escaped) by feeReminderEmail.js from server-verified values.
   * The recipient address is never logged and the provider message id is not returned.
   */
  async sendFeeReminderEmail({ studentEmail, studentName, classroomName, amount, dueDate, customNote }) {
    try {
      if (!studentEmail) return { success: false, error: 'No student email provided' };

      const { subject, html } = buildFeeReminderEmail({ studentName, classroomName, amount, dueDate, note: customNote });
      const mailOptions = {
        from: this.config.EMAIL_FROM || '"Core5 Academy" <support@core5.co.in>',
        to: studentEmail,
        subject,
        html
      };

      if (this.transporter) {
        await this.transporter.sendMail(mailOptions);
        console.log('✅ [Fee Reminder Email] Sent');
        return { success: true, delivered: true };
      }
      return { success: true, mock: true };
    } catch (error) {
      console.error('❌ Error sending fee reminder email:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();

