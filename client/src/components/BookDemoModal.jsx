import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, CheckCircle2, ShieldCheck, Sparkles, Building2, User, Mail, Users, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../config/api';

// API_BASE comes from config/api

const BookDemoModal = ({ isOpen, onClose }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    workEmail: '',
    institutionName: '',
    role: 'Dean / Director',
    studentCount: '1,000 - 5,000',
    preferredDate: '',
    preferredTime: '10:00 AM'
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errorMessage) setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await axios.post(`${API_BASE}/demo-requests`, formData);
      if (response.data && response.data.success) {
        setIsSubmitted(true);
      } else {
        setErrorMessage(response.data?.message || 'Failed to submit demo request.');
      }
    } catch (error) {
      console.error('Error submitting demo request:', error);
      const msg = error.response?.data?.message || error.message || 'Server connection error. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSubmitted(false);
    setIsLoading(false);
    setErrorMessage('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleResetAndClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Modal Container (Exact Sharp Square Geometry) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative w-full max-w-4xl bg-white rounded-none shadow-2xl overflow-hidden z-10 border border-slate-200"
        >
          {/* Close Button */}
          <button
            onClick={handleResetAndClose}
            className="absolute top-5 right-5 p-2.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors z-20"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
            
            {/* Left Side: Enterprise Sales Pitch Banner (Light Theme) */}
            <div className="lg:col-span-5 bg-white border-r border-slate-200/80 text-slate-900 p-8 lg:p-10 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-900/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-6 relative z-10">
                <h3 className="text-2xl lg:text-3xl font-serif-heading font-light text-[#1d528f] leading-tight tracking-tight">
                  Schedule a Live Walkthrough of Core5 LMS.
                </h3>

                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  Experience how Core5 unifies course delivery, student analytics, lab inventory, and tuition billing into one secure ecosystem for your institution.
                </p>

                {/* Key Benefits */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center space-x-3 text-xs sm:text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                    <span>Tailored for 100 to 50,000+ Students</span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs sm:text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                    <span>24/7 AI GuideBot & Live Analytics Demo</span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs sm:text-sm font-semibold text-slate-700">
                    <ShieldCheck className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                    <span>ISO 27001 Security & Custom ERP Integration</span>
                  </div>
                </div>
              </div>

              {/* Bottom Testimonial Note */}
              <div className="pt-8 border-t border-slate-200/80 relative z-10">
                <div className="text-[11px] font-semibold text-slate-500">Trusted by Deans & IT Directors across 50+ Global Universities.</div>
              </div>
            </div>

            {/* Right Side: Interactive Form or Success State (Crisp White Container) */}
            <div className="lg:col-span-7 p-8 lg:p-10 bg-white flex flex-col justify-center">
              {!isSubmitted ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <h4 className="text-xl font-serif-heading font-light text-[#1d528f]">
                      Book Your 1-on-1 Live Session
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Our Enterprise Solutions Specialist will prepare a customized demo for your team.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          name="fullName"
                          required
                          value={formData.fullName}
                          onChange={handleChange}
                          placeholder="Dr. Sarah Jenkins"
                          className="w-full pl-9 pr-3 py-2.5 rounded-none border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-amber-600 bg-white shadow-xs"
                        />
                      </div>
                    </div>

                    {/* Official Work Email */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Work Email *</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="email"
                          name="workEmail"
                          required
                          value={formData.workEmail}
                          onChange={handleChange}
                          placeholder="s.jenkins@stanford.edu"
                          className="w-full pl-9 pr-3 py-2.5 rounded-none border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-amber-600 bg-white shadow-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Institution Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">University / Institute *</label>
                      <div className="relative">
                        <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          name="institutionName"
                          required
                          value={formData.institutionName}
                          onChange={handleChange}
                          placeholder="Stanford University"
                          className="w-full pl-9 pr-3 py-2.5 rounded-none border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-amber-600 bg-white shadow-xs"
                        />
                      </div>
                    </div>

                    {/* Student Strength */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Total Student Count</label>
                      <div className="relative">
                        <Users className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <select
                          name="studentCount"
                          value={formData.studentCount}
                          onChange={handleChange}
                          className="w-full pl-9 pr-3 py-2.5 rounded-none border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-amber-600 bg-white shadow-xs"
                        >
                          <option value="Under 1,000">Under 1,000 Students</option>
                          <option value="1,000 - 5,000">1,000 - 5,000 Students</option>
                          <option value="5,000 - 20,000">5,000 - 20,000 Students</option>
                          <option value="20,000+">20,000+ Students (Global Enterprise)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Preferred Date & Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Date</label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="date"
                          name="preferredDate"
                          value={formData.preferredDate}
                          onChange={handleChange}
                          className="w-full pl-9 pr-3 py-2.5 rounded-none border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-amber-600 bg-white shadow-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Time</label>
                      <div className="relative">
                        <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <select
                          name="preferredTime"
                          value={formData.preferredTime}
                          onChange={handleChange}
                          className="w-full pl-9 pr-3 py-2.5 rounded-none border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-amber-600 bg-white shadow-xs"
                        >
                          <option value="09:00 AM">09:00 AM (Morning Slot)</option>
                          <option value="10:00 AM">10:00 AM (Morning Slot)</option>
                          <option value="11:00 AM">11:00 AM (Morning Slot)</option>
                          <option value="12:00 PM">12:00 PM (Noon Slot)</option>
                          <option value="01:00 PM">01:00 PM (Afternoon Slot)</option>
                          <option value="02:00 PM">02:00 PM (Afternoon Slot)</option>
                          <option value="03:00 PM">03:00 PM (Afternoon Slot)</option>
                          <option value="04:00 PM">04:00 PM (Late Afternoon)</option>
                          <option value="05:00 PM">05:00 PM (Evening Slot)</option>
                          <option value="06:00 PM">06:00 PM (Evening Slot)</option>
                          <option value="07:00 PM">07:00 PM (Late Evening Slot)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Error Alert if any */}
                  {errorMessage && (
                    <div className="p-3 bg-rose-50 border-l-4 border-rose-500 text-rose-700 text-xs flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Submit CTA */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 header-button bg-[#B99652] hover:bg-[#a68443] disabled:opacity-75 disabled:cursor-not-allowed text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] border-none rounded-none shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center space-x-2 mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Confirming Schedule...</span>
                      </>
                    ) : (
                      <>
                        <span>Schedule Live Demo</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Success State */
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-4 py-8"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <h4 className="text-2xl font-serif-heading font-bold text-slate-900">
                    Demo Request Confirmed!
                  </h4>

                  <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                    Thank you, <span className="font-bold text-slate-900">{formData.fullName}</span>! Our Enterprise Solutions Team will send a Google Meet calendar invitation to <span className="font-bold text-[#F05A36]">{formData.workEmail}</span> within 15 minutes.
                  </p>

                  <div className="pt-4">
                    <button
                      onClick={handleResetAndClose}
                      className="px-6 py-2.5 rounded-full bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors shadow-sm"
                    >
                      Return to Core5 Homepage
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BookDemoModal;
