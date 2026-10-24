import React, { useState } from 'react';
import TermsConditionsModal from './TermsConditionsModal';

const LoginFooter = () => {
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const openTermsModal = () => setIsTermsModalOpen(true);
  const closeTermsModal = () => {
    setIsTermsModalOpen(false);
    setAcknowledged(false);
  };

  return (
    <>
      {/* Footer */}
      <div className="bg-black/40 backdrop-blur-sm border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-white/80 text-sm">
            {/* Copyright */}
            <span className="text-center sm:text-left">
              © 2026 Core5 Academy. All rights reserved.
            </span>
            
            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm">
              <button
                onClick={openTermsModal}
                className="text-blue-400 hover:text-blue-300 underline transition-all duration-200 hover:scale-105 font-medium"
                aria-label="Open Terms & Conditions"
              >
                Terms & Conditions
              </button>
              <span className="text-white/40">|</span>
              <a
                href="/privacy"
                className="text-blue-400 hover:text-blue-300 underline transition-all duration-200 hover:scale-105 font-medium"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Privacy Policy page will be available soon!');
                }}
              >
                Privacy Policy
              </a>
              <span className="text-white/40">|</span>
              <a
                href="mailto:support@core5academy.com"
                className="text-blue-400 hover:text-blue-300 underline transition-all duration-200 hover:scale-105 font-medium"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Terms Modal - Reusing existing component */}
      <div className={`fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 ${isTermsModalOpen ? '' : 'hidden'}`}>
        {isTermsModalOpen && (
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Terms & Conditions</h2>
              <button
                onClick={closeTermsModal}
                className="p-2 hover:bg-white/20 rounded-full transition"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Welcome Message */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Welcome to EduMentor LMS</h3>
                <p className="text-gray-600">
                  Please read and review our Terms & Conditions carefully before using our Learning Management System.
                </p>
              </div>

              {/* Terms Content */}
              <div className="prose max-w-none text-sm">
                <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500">
                  <p className="text-blue-800 font-medium">
                    PLEASE READ THESE TERMS AND CONDITIONS CAREFULLY BEFORE ACCESSING OR USING THE PLATFORM. BY REGISTERING, SUBSCRIBING, OR USING ANY PART OF OUR SERVICES, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, PLEASE DISCONTINUE USE IMMEDIATELY.
                  </p>
                </div>

                <h4 className="text-lg font-semibold mb-3">1. DEFINITIONS</h4>
                <p className="text-gray-600 mb-4">
                  For the purposes of these Terms and Conditions, the following terms shall have the meanings assigned to them:
                  "Company", "We", "Us", or "Our" refers to Core5 Academy Private Limited, a company incorporated under the Companies Act, 2013, having its registered office at [Registered Address, City, State, PIN Code, India].
                  "Platform" means the Learning Management System (LMS) accessible via our web application, including all associated mobile applications, APIs, and digital interfaces.
                  "User", "You", or "Your" refers to any individual or entity who accesses, registers, or subscribes to the Platform.
                  "Subscription" means the recurring monthly or annual paid plan that grants access to content and features on the Platform.
                  "Content" means all educational materials, videos, documents, assessments, and other resources available on the Platform.
                  "Payment Gateway" refers to Razorpay Software Private Limited, the authorised payment aggregator facilitating transactions on the Platform.
                  "RBI" means the Reserve Bank of India.
                  "Intellectual Property" means all copyrights, trademarks, trade secrets, patents, and other proprietary rights in the Platform and its Content.
                </p>

                <h4 className="text-lg font-semibold mb-3">2. ACCEPTANCE OF TERMS</h4>
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

                <h4 className="text-lg font-semibold mb-3">3. ACCOUNT REGISTRATION & SECURITY</h4>
                <div className="text-gray-600 mb-4 space-y-2">
                  <p>3.1 To access the Platform, you must create an account by providing valid credentials including your name, email address, and other required details.</p>
                  <p>3.2 You are solely responsible for:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Maintaining the confidentiality of your login credentials;</li>
                    <li>All activities that occur under your account;</li>
                    <li>Notifying us immediately at legal@core5.com of any unauthorised access or security breach.</li>
                  </ul>
                  <p>3.3 The Company reserves the right to suspend or terminate accounts found to be in violation of these Terms, engaged in fraudulent activity, or sharing login credentials with unauthorised third parties.</p>
                </div>

                <h4 className="text-lg font-semibold mb-3">4. INTELLECTUAL PROPERTY RIGHTS</h4>
                <div className="text-gray-600 mb-4 space-y-2">
                  <p>4.1 All content, software, design, trademarks, service marks, logos, and other intellectual property available on the Platform are the exclusive property of the Company or its licensors, protected under the Copyright Act, 1957, the Trade Marks Act, 1999, and applicable international laws.</p>
                  <p>4.2 Your subscription grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform's Content for personal, non-commercial educational purposes only.</p>
                  <p>4.3 You shall not, without prior written consent of the Company:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Copy, reproduce, distribute, publish, or transmit any Content;</li>
                    <li>Reverse engineer, decompile, or disassemble any software on the Platform;</li>
                    <li>Use the Platform or Content for commercial training, resale, or redistribution;</li>
                    <li>Remove or alter any copyright, trademark, or proprietary notices;</li>
                    <li>Create derivative works based on Platform Content.</li>
                  </ul>
                </div>

                <h4 className="text-lg font-semibold mb-3">5. PRIVACY & DATA PROTECTION</h4>
                <div className="text-gray-600 mb-4 space-y-2">
                  <p>5.1 The collection, storage, and processing of your personal data is governed by our Privacy Policy available on our platform, which forms an integral part of these Terms.</p>
                  <p>5.2 We comply with the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Digital Personal Data Protection Act, 2023 (DPDPA).</p>
                  <p>5.3 Payment data is handled by Razorpay and is not stored on the Company's servers. We do not have access to your full card details. Your financial data is protected by Razorpay's PCI-DSS Level 1 compliant infrastructure.</p>
                </div>

                <h4 className="text-lg font-semibold mb-3">6. DISCLAIMER & LIMITATION OF LIABILITY</h4>
                <div className="text-gray-600 mb-4 space-y-2">
                  <p>6.1 The Platform and all Content are provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
                  <p>6.2 The Company does not warrant that:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>The Platform will be uninterrupted, error-free, or free of viruses or malware;</li>
                    <li>The results obtained from using the Platform will meet your requirements or expectations;</li>
                    <li>Content will always be up-to-date, accurate, or complete.</li>
                  </ul>
                  <p>6.3 To the maximum extent permitted by applicable law, the Company's total liability to you for any claim shall not exceed the total subscription fees paid by you in the three (3) months immediately preceding the claim.</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t p-6 bg-gray-50">
              <div className="flex items-start mb-4">
                <input
                  type="checkbox"
                  id="footer-acknowledge"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="footer-acknowledge" className="ml-3 text-sm text-gray-700">
                  <strong>I acknowledge</strong> that I have read, understood, and agree to be bound by the Terms & Conditions of Core5 Academy. I understand that this is a legally binding agreement and I accept all responsibilities outlined herein.
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={closeTermsModal}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:scale-105 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={closeTermsModal}
                  disabled={!acknowledged}
                  className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                    acknowledged
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 hover:scale-105 shadow-lg'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Accept & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default LoginFooter;
