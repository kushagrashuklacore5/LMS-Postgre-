import React, { useState } from 'react';
import { ShieldCheck, CheckCircle, FileText, Lock } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';

const ControlledTermsModal = ({ isOpen, onAccept }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const ModalContent = () => {
    const [acknowledged, setAcknowledged] = useState(false);

    React.useEffect(() => {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = previousOverflow; };
    }, []);

    const handleAccept = () => {
      if (acknowledged) {
        localStorage.setItem('termsAccepted', 'true');
        localStorage.setItem('termsAcceptedDate', new Date().toISOString());
        onAccept();
      }
    };

    return (
      <div className="fixed inset-0 bg-[#1e1b4b]/60 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="terms-dialog-title">
        <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none max-w-3xl w-full max-h-[94vh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-[#002366] text-white px-6 sm:px-8 py-5 flex justify-between items-center gap-4 flex-shrink-0 border-b border-[#B99652]/40">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 bg-[#B99652]/20 border border-[#B99652] text-[#B99652] flex items-center justify-center flex-shrink-0 rounded-none">
                <ShieldCheck size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold tracking-wide text-white">
                  {t('terms_and_conditions_title') !== 'terms_and_conditions_title' ? t('terms_and_conditions_title') : 'Core5 LMS — Terms & Conditions'}
                </h2>
                <p className="text-[11px] sm:text-xs text-[#d9bf85] font-medium mt-0.5 uppercase tracking-[0.14em]">
                  {t('terms_agreement_subtitle') !== 'terms_agreement_subtitle' ? t('terms_agreement_subtitle') : 'Institutional Master Service & Usage Agreement'}
                </p>
              </div>
            </div>
            <div className="hidden sm:block px-3 py-1.5 border border-[#B99652] bg-[#B99652]/15 text-[#e6cf9c] text-[11px] font-semibold tracking-[0.14em] uppercase whitespace-nowrap rounded-none">
              {t('mandatory_review') !== 'mandatory_review' ? t('mandatory_review') : 'Mandatory Review'}
            </div>
          </div>
          <div className="h-[2px] flex-shrink-0 bg-gradient-to-r from-[#B99652]/20 via-[#B99652] to-[#B99652]/20" />

          {/* Content */}
          <div className="px-5 sm:px-7 py-5 overflow-y-auto overscroll-contain flex-1 scrollable-content bg-white">
            {/* Welcome Message */}
            <div className="mb-6">
              <h3 className="text-lg sm:text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-2">Welcome to EduMentor LMS</h3>
              <p className="text-gray-600">
                Please read and review our Terms & Conditions carefully before using our Learning Management System.
              </p>
            </div>

            {/* Terms Content - Same as original */}
            <div className="max-w-none text-sm leading-relaxed">
              <div className="mb-6 p-4 bg-[#fff8e7] border border-[#ebdcaa] border-l-4 border-l-[#B99652]">
                <p className="text-[#1e1b4b] font-semibold text-xs sm:text-sm leading-relaxed">
                  PLEASE READ THESE TERMS AND CONDITIONS CAREFULLY BEFORE ACCESSING OR USING THE PLATFORM. BY REGISTERING, SUBSCRIBING, OR USING ANY PART OF OUR SERVICES, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, PLEASE DISCONTINUE USE IMMEDIATELY.
                </p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">1. DEFINITIONS</h4>
              <p className="text-gray-600 mb-4">
                For the purposes of these Terms and Conditions, the following terms shall have the meanings assigned to them:
                "Company", "We", "Us", or "Our" refers to [YOUR COMPANY NAME] Private Limited, a company incorporated under the Companies Act, 2013, having its registered office at [Registered Address, City, State, PIN Code, India].
                "Platform" means the Learning Management System (LMS) accessible via [www.yourwebsite.com], including all associated mobile applications, APIs, and digital interfaces.
                "User", "You", or "Your" refers to any individual or entity who accesses, registers, or subscribes to the Platform.
                "Subscription" means the recurring monthly or annual paid plan that grants access to content and features on the Platform.
                "Content" means all educational materials, videos, documents, assessments, and other resources available on the Platform.
                "Payment Gateway" refers to Razorpay Software Private Limited, the authorised payment aggregator facilitating transactions on the Platform.
                "RBI" means the Reserve Bank of India.
                "Intellectual Property" means all copyrights, trademarks, trade secrets, patents, and other proprietary rights in the Platform and its Content.
              </p>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">2. ACCEPTANCE OF TERMS</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>2.1 By accessing or using the Platform, you represent and warrant that:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>You are at least 18 years of age, or if you are a minor, you are using the Platform under the supervision and with the consent of a parent or legal guardian;</li>
                  <li>You have the legal capacity and authority to enter into a binding agreement;</li>
                  <li>You are not barred from receiving services under applicable laws in India or the jurisdiction where you reside;</li>
                  <li>All information you provide during registration is accurate, current, and complete.</li>
                </ul>
                <p>2.2 If you are accessing the Platform on behalf of a corporation, educational institution, or other legal entity, you represent that you have the authority to bind that entity to these Terms.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">3. ACCOUNT REGISTRATION & SECURITY</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>3.1 To access the Platform, you must create an account by providing valid credentials including your name, email address, and other required details.</p>
                <p>3.2 You are solely responsible for:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Maintaining the confidentiality of your login credentials;</li>
                  <li>All activities that occur under your account;</li>
                  <li>Notifying us immediately at [legal@yourcompany.com] of any unauthorised access or security breach.</li>
                </ul>
                <p>3.3 The Company reserves the right to suspend or terminate accounts found to be in violation of these Terms, engaged in fraudulent activity, or sharing login credentials with unauthorised third parties.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">4. SUBSCRIPTION PLANS & PRICING</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>4.1 Plan Types - The Platform offers the following subscription models:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Monthly Subscription: Billed on a recurring monthly basis from the date of initial subscription.</li>
                  <li>Annual Subscription: Billed annually, offering access for a period of twelve (12) consecutive months from the activation date.</li>
                </ul>
                <p>4.2 Pricing - All subscription prices are displayed in Indian Rupees (INR) for domestic users and in applicable foreign currency (USD/GBP/EUR/AED) for international users. Prices are inclusive of applicable taxes unless stated otherwise. The Company reserves the right to revise pricing at any time, with prior notice of at least 30 (thirty) days.</p>
                <p>4.3 Auto-Renewal - Subscriptions are set to auto-renew by default. By subscribing, you authorise the Company and its payment processor Razorpay to charge your registered payment method on each renewal date without further authorisation. You may disable auto-renewal at any time through your account settings before the renewal date.</p>
                <p>4.4 Free Trials - Where a free trial is offered, it will be clearly stated at the time of sign-up. At the end of the trial period, your subscription will automatically convert to a paid plan unless cancelled before the trial ends.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">5. PAYMENT TERMS</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>5.1 Payment Gateway — Razorpay - All payments on the Platform are processed through Razorpay Software Private Limited, a Payment Aggregator authorised by the Reserve Bank of India under the Payment and Settlement Systems Act, 2007. By making a payment, you agree to Razorpay's Terms of Service and Privacy Policy available at https://razorpay.com/terms/.</p>
                <p>5.2 Accepted Payment Methods - The Platform accepts the following payment instruments through Razorpay:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Credit Cards and Debit Cards (Visa, Mastercard, RuPay, American Express)</li>
                  <li>Net Banking (all major Indian banks)</li>
                  <li>UPI (Unified Payments Interface)</li>
                  <li>Wallets (Paytm, PhonePe, Mobikwik, and others supported by Razorpay)</li>
                  <li>EMI (where available and applicable)</li>
                  <li>International Cards (Visa / Mastercard / Amex for international users)</li>
                </ul>
                <p>5.3 RBI Compliance & Data Localisation - In compliance with RBI guidelines on storage of payment system data, all payment data is stored exclusively on servers located in India. Card-on-file and tokenisation services are handled by Razorpay in accordance with RBI's Card-on-File Tokenisation (CoFT) Framework.</p>
                <p>5.4 Recurring Payments & E-NACH / SI Mandate - For recurring subscription billing, we use Razorpay's automated mandate system in compliance with RBI's guidelines on recurring transactions. You may be required to authenticate the initial mandate via your bank's two-factor authentication (2FA). Subsequent auto-debits up to the authorised limit will proceed without additional authentication.</p>
                <p>5.5 Currency & GST - All domestic transactions are processed in Indian Rupees (INR). Goods and Services Tax (GST) will be levied as applicable under the Central Goods and Services Tax Act, 2017, and will be reflected in your invoice. International transactions may be subject to currency conversion charges by your bank or card issuer.</p>
                <p>5.6 Payment Failure - In the event of a payment failure, your access to the Platform may be suspended until the outstanding amount is cleared. The Company shall not be liable for any loss of access to content due to payment failures attributable to your bank, card issuer, or payment instrument.</p>
                <p>5.7 Invoicing - A GST-compliant invoice/receipt will be emailed to your registered email address upon each successful payment. It is your responsibility to provide accurate billing information, including your GSTIN if you wish to claim input tax credit.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">6. REFUND & CANCELLATION POLICY</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p className="font-semibold text-red-600">ALL SUBSCRIPTION FEES ARE NON-REFUNDABLE. ONCE A PAYMENT IS PROCESSED AND THE SUBSCRIPTION IS ACTIVATED, NO REFUND WILL BE ISSUED UNDER ANY CIRCUMSTANCES, INCLUDING BUT NOT LIMITED TO CHANGE OF MIND, DISSATISFACTION WITH CONTENT, OR TECHNICAL ISSUES ATTRIBUTABLE TO YOUR DEVICE OR INTERNET CONNECTION.</p>
                <p>6.1 Cancellation of Subscription - You may cancel your subscription at any time through your account settings. Upon cancellation:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Your subscription will remain active until the end of the current billing cycle (monthly or annual).</li>
                  <li>You will not be charged for the subsequent billing cycle.</li>
                  <li>No pro-rata refund will be issued for the unused portion of any subscription period.</li>
                </ul>
                <p>6.2 Exceptions - Refunds may be considered solely at the Company's discretion only in the following limited circumstances:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Where a duplicate charge has occurred due to a technical error confirmed by Razorpay;</li>
                  <li>Where a transaction has been erroneously debited but subscription access was not provisioned.</li>
                </ul>
                <p>6.3 Dispute Resolution for Payments - Any payment disputes must be raised within 7 (seven) days of the charge date by writing to [legal@yourcompany.com]. The Company will investigate and respond within 15 (fifteen) business days. Disputes raised beyond 7 days will not be entertained.</p>
                <p>6.4 Chargebacks - Initiating an unjustified chargeback through your bank or card issuer constitutes a breach of these Terms. The Company reserves the right to suspend your account immediately upon notification of a chargeback and to pursue recovery of the disputed amount through appropriate legal means.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">7. INTELLECTUAL PROPERTY RIGHTS</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>7.1 All content, software, design, trademarks, service marks, logos, and other intellectual property available on the Platform are the exclusive property of the Company or its licensors, protected under the Copyright Act, 1957, the Trade Marks Act, 1999, and applicable international laws.</p>
                <p>7.2 Your subscription grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform's Content for personal, non-commercial educational purposes only.</p>
                <p>7.3 You shall not, without prior written consent of the Company:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Copy, reproduce, distribute, publish, or transmit any Content;</li>
                  <li>Reverse engineer, decompile, or disassemble any software on the Platform;</li>
                  <li>Use the Platform or Content for commercial training, resale, or redistribution;</li>
                  <li>Remove or alter any copyright, trademark, or proprietary notices;</li>
                  <li>Create derivative works based on Platform Content.</li>
                </ul>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">8. ACCEPTABLE USE & USER CONDUCT</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>8.1 You agree to use the Platform solely for lawful purposes. You shall not:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Upload or transmit any content that is defamatory, obscene, harassing, hateful, or violates any applicable law;</li>
                  <li>Impersonate any person or entity or misrepresent your affiliation;</li>
                  <li>Attempt to gain unauthorised access to any part of the Platform or its infrastructure;</li>
                  <li>Use automated bots, scrapers, or other automated means to access Platform Content;</li>
                  <li>Share your login credentials with third parties or allow multiple simultaneous logins.</li>
                </ul>
                <p>8.2 The Company reserves the right to remove any user-generated content and suspend or terminate your account for violation of this section, without notice and without liability.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">9. PRIVACY & DATA PROTECTION</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>9.1 The collection, storage, and processing of your personal data is governed by our Privacy Policy available at [www.yourwebsite.com/privacy-policy], which forms an integral part of these Terms.</p>
                <p>9.2 We comply with the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Digital Personal Data Protection Act, 2023 (DPDPA).</p>
                <p>9.3 Payment data is handled by Razorpay and is not stored on the Company's servers. We do not have access to your full card details. Your financial data is protected by Razorpay's PCI-DSS Level 1 compliant infrastructure.</p>
                <p>9.4 For international users, data transfers are subject to applicable cross-border data transfer regulations and are conducted with appropriate safeguards.</p>
              </div>

              <h4 className="text-base sm:text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-6 mb-2 pb-1.5 border-b border-[#ebdcaa]/70">10. DISCLAIMER</h4>
              <div className="text-gray-600 mb-4 space-y-2">
                <p>10.1 The Platform and all Content are provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind.</p>
                <p>10.2 Your use of the Platform is at your own risk. The Company disclaims all warranties, whether express or implied.</p>
              </div>
            </div>
          </div>

          {/* Footer with Checkbox and Accept Button */}
          <div className="border-t border-[#ebdcaa] px-5 sm:px-7 py-4 bg-[#fffdf4] flex-shrink-0">
            <div className="flex items-start mb-4">
              <input
                type="checkbox"
                id="acknowledge"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#B99652] border-[#ebdcaa] rounded-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B99652]/50 flex-shrink-0"
              />
              <label htmlFor="acknowledge" className="ml-3 text-xs sm:text-sm text-[#1e1b4b]/90 leading-relaxed cursor-pointer">
                <strong>I acknowledge</strong> that I have read, understood, and agree to be bound by Terms & Conditions of EduMentor LMS. I understand that this is a legally binding agreement and I accept all responsibilities outlined herein.
              </label>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleAccept}
                disabled={!acknowledged}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-none font-semibold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B99652]/50 ${
                  acknowledged
                    ? 'bg-[#B99652] hover:bg-[#a38241] text-white shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle size={18} />
                {t('accept_and_continue') !== 'accept_and_continue' ? t('accept_and_continue') : 'Accept & Continue to Dashboard'}
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  };

  return <ModalContent />;
};

export default ControlledTermsModal;
