import React, { useState, useEffect } from 'react';
import { CreditCard, Calendar, Check, X, AlertCircle, Star } from 'lucide-react';
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';
import { API_ORIGIN } from '../../config/api';

const Subscription = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  const API_BASE = API_ORIGIN;

  // Fetch subscription data on mount
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/subscriptions/current`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : null;

        if (data.success) {
          setSubscription(data.subscription);
        } else {
          console.error('Failed to fetch subscription:', data.message);
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  // Calculate remaining time
  const calculateRemainingTime = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diff = expiry - now;
    
    if (diff <= 0) return { expired: true };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, expired: false };
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription and switch to the Free plan?')) return;
    
    try {
      setCancelling(true);
      const response = await fetch(`${API_BASE}/api/subscriptions/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${text || 'no body'}`);
      
      const data = text ? JSON.parse(text) : null;
      if (data && data.success) {
        setSubscription(data.subscription);
        setShowCancelModal(false);
        toast.success('Subscription cancelled successfully! You are now on the Free plan.');
      } else {
        throw new Error((data && data.message) || 'Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Cancel subscription error:', error);
      toast.error('Failed to cancel subscription: ' + (error.message || error));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to load subscription</h2>
          <p className="text-gray-600">Please try again later.</p>
        </div>
      </div>
    );
  }

  const timeRemaining = calculateRemainingTime(subscription.expiryDate);
  const isExpired = timeRemaining.expired || subscription.status === 'expired';

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Subscription</h1>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            subscription.planType === 'free' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-blue-100 text-blue-800'
          }`}>
            {subscription.planName}
          </div>
        </div>

        {/* Current Plan Details */}
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Current Plan</h3>
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-yellow-500" />
                <span className="text-xl font-bold text-gray-900">{subscription.planName}</span>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              subscription.status === 'active' && !isExpired
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {isExpired ? 'Expired' : subscription.status}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center mb-2">
                <Calendar className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-700">Duration</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{subscription.durationDays} days</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center mb-2">
                <CreditCard className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-700">Type</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 capitalize">{subscription.planType}</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center mb-2">
                <Check className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-700">Trial</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {subscription.isFreeTrial ? 'Active' : 'Not Active'}
              </p>
            </div>
          </div>
        </div>

        {/* Time Remaining */}
        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {isExpired ? 'Subscription Expired' : 'Time Remaining'}
          </h3>
          {!isExpired ? (
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-900 mb-2">
                {timeRemaining.days}d {timeRemaining.hours}h {timeRemaining.minutes}m
              </div>
              <p className="text-gray-600">
                Expires on {new Date(subscription.expiryDate).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-3xl font-bold text-red-900 mb-2">Expired</div>
              <p className="text-gray-600">
                Expired on {new Date(subscription.expiryDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          {subscription.planType !== 'free' && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold shadow-lg"
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
            </button>
          )}
          
          {subscription.planType === 'free' && (
            <button
              onClick={() => alert('You are already on the Free plan! Upgrade to a paid plan to access more features.')}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-lg"
            >
              Upgrade Plan
            </button>
          )}
          
          {isExpired && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-lg"
            >
              Refresh Status
            </button>
          )}
        </div>

        {/* Plan Information */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">Plan Information</h4>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Start Date:</strong> {new Date(subscription.startDate).toLocaleDateString()}</p>
            <p><strong>Expiry Date:</strong> {new Date(subscription.expiryDate).toLocaleDateString()}</p>
            <p><strong>Status:</strong> <span className={`capitalize ${subscription.status === 'active' && !isExpired ? 'text-green-600' : 'text-red-600'}`}>
              {isExpired ? 'Expired' : subscription.status}
            </span></p>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Cancel Subscription</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to cancel your subscription? You will be downgraded to the Free plan immediately.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> You will get 10 days of free access after cancellation.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Keep Current Plan
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscription;
