import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import StudentLayout from '../../components/StudentLayout';
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import {
  Award,
  Download,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Eye,
  Trophy,
  ChevronRight,
  BookOpen,
  TrendingUp,
  FileCheck,
  Shield,
  X,
  CheckSquare,
  ExternalLink
} from 'lucide-react';

const Certificates = () => {
  const { user, API, token } = useAuth();
  const { t } = useTranslation();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [stats, setStats] = useState({
    totalCertificates: 0,
    totalCourses: 0,
    completedCourses: 0,
    averageProgress: 0
  });
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const showToast = {
    success: (message) => toast.success(message, {
      position: "top-right",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "colored",
    }),
    error: (message) => toast.error(message, {
      position: "top-right",
      autoClose: 4000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "colored",
    }),
    warning: (message) => toast.warning(message, {
      position: "top-right",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "colored",
    }),
    info: (message) => toast.info(message, {
      position: "top-right",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "colored",
    })
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const certificatesResponse = await axios.get(`${API}/certificates`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        setCertificates(certificatesResponse.data || []);

        const coursesResponse = await axios.get(`${API}/courses/student`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const enrolledCourses = Array.isArray(coursesResponse.data) ? coursesResponse.data : (coursesResponse.data?.courses || []);
        
        const completedCourses = certificatesResponse.data?.length || 0;
        const totalProgress = enrolledCourses.length > 0 
          ? enrolledCourses.reduce((acc, course) => acc + (course.progress || 0), 0) / enrolledCourses.length
          : 0;

        setStats({
          totalCertificates: certificatesResponse.data?.length || 0,
          totalCourses: enrolledCourses.length,
          completedCourses,
          averageProgress: Math.round(totalProgress)
        });

      } catch (err) {
        console.error('Error fetching certificates:', err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          showToast.error(t('session_expired'));
        } else {
          showToast.error(t('could_not_load_certificates'));
        }
      } finally {
        setLoading(false);
      }
    };

    if (user && token) {
      fetchData();
    }
  }, [user, token, API]);

  const handleDownload = async (certificate) => {
    if (downloading) return;
    
    setDownloading(certificate._id);
    try {
      if (!certificate.certificateUrl) {
        showToast.info('Generating your certificate...');
        await axios.post(
          `${API}/certificates/generate/${certificate.courseId?._id || certificate.courseId}`,
          null,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const refreshed = await axios.get(`${API}/certificates`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCertificates(refreshed.data || []);
        
        const updatedCert = refreshed.data.find(c => c._id === certificate._id);
        certificate = updatedCert || certificate;
        showToast.success('Certificate generated successfully!');
      }

      const response = await axios.get(
        `${API}/certificates/download/${certificate._id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `certificate_${certificate.courseId?.title || certificate._id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast.success(t('certificate_downloaded_successfully'));
      
    } catch (err) {
      console.error('Download error:', err);
      if (err.response?.status === 400) {
        showToast.error(t('certificate_not_ready'));
      } else if (err.response?.status === 404) {
        showToast.error(t('certificate_not_found'));
      } else if (err.response?.status === 403) {
        showToast.error(t('no_permission_download'));
      } else {
        showToast.error(t('unable_download_certificate'));
      }
    } finally {
      setDownloading(null);
    }
  };

  const handlePreview = (certificate) => {
    if (certificate.certificateUrl) {
      setSelectedCertificate(certificate);
      setShowPreview(true);
    } else {
      showToast.warning(t('certificate_being_prepared'));
    }
  };

  // The session token is sent in a header, never in the address: an address ends up in
  // browser history and server logs.
  const handleViewExternal = async (certificateId) => {
    try {
      const response = await axios.get(`${API}/certificates/view/${certificateId}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      showToast.error(t('unable_download_certificate'));
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getCertificateStatus = (certificate) => {
    if (certificate.certificateUrl) return 'generated';
    return 'pending';
  };

  const CertificatePreviewModal = () => {
    if (!selectedCertificate || !showPreview) return null;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-xl font-bold text-text">Certificate Preview</h3>
              <p className="text-gray-600 text-sm">
                {selectedCertificate.courseId?.title || 'Course Certificate'}
              </p>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Certificate Preview */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            <div className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-300 rounded-xl p-8">
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-10 h-10 text-primary" />
                </div>
                <h4 className="text-2xl font-bold text-text mb-2">Certificate of Completion</h4>
                <p className="text-gray-600">This certificate is awarded to</p>
              </div>

              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold text-primary mb-4">{user?.name || 'Student Name'}</h3>
                <p className="text-lg text-gray-700 mb-2">
                  for successfully completing the course
                </p>
                <h4 className="text-xl font-bold text-text">
                  {selectedCertificate.courseId?.title || 'Course Title'}
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-12 pt-8 border-t border-gray-300">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Date Issued</p>
                  <p className="font-semibold text-text">
                    {formatDate(selectedCertificate.issuedAt)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Certificate ID</p>
                  <p className="font-mono text-sm text-gray-500">
                    {selectedCertificate._id.substring(0, 12)}...
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => handleViewExternal(selectedCertificate._id)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-text font-medium rounded-xl hover:bg-gray-100 transition-colors border border-gray-300"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="px-5 py-2.5 text-text font-medium rounded-xl hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => handleDownload(selectedCertificate)}
                disabled={downloading === selectedCertificate._id}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading === selectedCertificate._id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="min-min-h-screen bg-background p-4 sm:p-8 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          </div>
          <p className="mt-6 text-gray-600 text-base sm:text-lg">{t('loading_certificates')}</p>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="min-min-h-screen bg-background">
        {/* Toast Container */}
        <ToastContainer />

        {/* Certificate Preview Modal */}
        <CertificatePreviewModal />

        {/* Header Section */}
        <div className="bg-gradient-to-r from-primary to-secondary text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Trophy className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">{t('my_certificates')}</h1>
                    <p className="text-white/80 mt-2 text-sm sm:text-base">
                      {t('your_earned_achievements')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
                    <Award className="w-4 h-4" />
                    {stats.totalCertificates} Certificate{stats.totalCertificates !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
                    <BookOpen className="w-4 h-4" />
                    {stats.completedCourses} Course{stats.completedCourses !== 1 ? 's' : ''} Completed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{t('total_certificates')}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-text">{stats.totalCertificates}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Award className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{t('courses_completed')}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-text">{stats.completedCourses}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{t('enrolled_courses')}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-text">{stats.totalCourses}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-secondary" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">Average Progress</p>
                  <p className="text-2xl sm:text-3xl font-bold text-text">{stats.averageProgress}%</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-warning" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-text">Your Certificates</h2>
              <p className="text-gray-600 text-sm sm:text-base">Download and share your achievements</p>
            </div>
          </div>

          {certificates.length === 0 ? (
            <div className="bg-white rounded-xl sm:rounded-2xl border-2 border-dashed border-gray-300 p-8 sm:p-12 text-center">
              <div className="w-16 h-16 sm:w-24 sm:h-24 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                <Award className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400" />
              </div>
              <h3 className="text-lg sm:text-2xl font-semibold text-gray-700 mb-2">No certificates yet</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto text-sm sm:text-base">
                Complete your courses to earn certificates and showcase your achievements.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/student/courses"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-secondary transition-colors"
                >
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                  Browse Courses
                </Link>
                <Link
                  to="/student/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-text font-medium rounded-xl hover:bg-gray-50 transition-colors border border-gray-300"
                >
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  View Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {certificates.map(certificate => {
                const status = getCertificateStatus(certificate);
                const courseTitle = certificate.courseId?.title || 'Course Certificate';
                
                return (
                  <div 
                    key={certificate._id} 
                    className="group bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300"
                  >
                    <div className="p-4 sm:p-6 bg-gradient-to-r from-primary/5 to-secondary/5 border-b border-gray-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Award className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          status === 'generated' 
                            ? 'bg-success/10 text-success' 
                            : 'bg-warning/10 text-warning'
                        }`}>
                          {status === 'generated' ? 'Ready' : 'Pending'}
                        </div>
                      </div>
                      
                      <h3 className="font-bold text-text mb-2 line-clamp-2 text-base sm:text-lg">
                        {courseTitle}
                      </h3>
                      <p className="text-gray-600 text-sm">Certificate of Completion</p>
                    </div>

                    <div className="p-4 sm:p-6">
                      <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">Issued</span>
                          </div>
                          <span className="font-medium text-text text-sm sm:text-base">
                            {formatDate(certificate.issuedAt)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-gray-600">
                            <FileCheck className="w-4 h-4" />
                            <span className="text-sm">Status</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {status === 'generated' ? (
                              <CheckCircle className="w-4 h-4 text-success" />
                            ) : (
                              <Clock className="w-4 h-4 text-warning" />
                            )}
                            <span className="font-medium text-text text-sm sm:text-base">
                              {status === 'generated' ? 'Generated' : 'Pending'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Shield className="w-4 h-4" />
                            <span className="text-sm">ID</span>
                          </div>
                          <span className="font-mono text-xs text-gray-500 truncate ml-2">
                            {certificate._id.substring(0, 8)}...
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => handlePreview(certificate)}
                          disabled={status !== 'generated'}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors ${
                            status === 'generated'
                              ? 'bg-primary text-white hover:bg-secondary'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Eye className="w-4 h-4" />
                          Preview
                        </button>
                        
                        <button
                          onClick={() => handleDownload(certificate)}
                          disabled={downloading === certificate._id}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors ${
                            status === 'generated'
                              ? 'bg-success text-white hover:bg-success/90'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {downloading === certificate._id ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span className="whitespace-nowrap">Processing...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Download
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Help Section for mobile */}
        <div className="lg:hidden max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="bg-primary/5 rounded-xl p-6 border border-primary/20">
            <h4 className="font-bold text-text mb-3">Need help with certificates?</h4>
            <p className="text-gray-600 text-sm mb-4">
              Contact support if you have issues with certificate generation or download.
            </p>
            <Link
              to="/student/support"
              className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
            >
              Get Help
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .line-clamp-2 {
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
        }
      `}</style>
    </StudentLayout>
  );
};

export default Certificates;