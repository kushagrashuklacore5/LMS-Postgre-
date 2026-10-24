import React, { useState, useEffect } from 'react'
import { Shield, Check, ArrowRight, X } from 'lucide-react'
import SuperAdminLayout from '../../components/SuperAdminLayout'
import { useAuth } from '../../auth/auth'

const SuperAdminSubscription = () => {
  const { API } = useAuth()
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [currentSubscription, setCurrentSubscription] = useState(null)
  const [planName, setPlanName] = useState('Free')

  // Fetch current subscription on mount
  useEffect(() => {
    const fetchCurrentSubscription = async () => {
      try {
        const response = await fetch(`${API}/subscriptions/current`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })

        const text = await response.text()
        const data = text ? JSON.parse(text) : null

        if (data && data.success) {
          setCurrentSubscription(data.subscription)
          setPlanName(data.subscription.planName)
        }
      } catch (error) {
        console.error('Error fetching current subscription:', error)
      }
    }

    fetchCurrentSubscription()
  }, [API])

  // Add refresh function for subscription updates
  const refreshSubscription = async () => {
    try {
      const response = await fetch(`${API}/subscriptions/current`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const text = await response.text()
      const data = text ? JSON.parse(text) : null

      if (data && data.success) {
        setCurrentSubscription(data.subscription)
        setPlanName(data.subscription.planName)
        console.log('✅ Subscription refreshed successfully:', data.subscription)
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error)
    }
  }

  // Make refresh function available globally
  useEffect(() => {
    window.refreshSubscription = refreshSubscription

    // Listen for subscription refresh events
    const handleSubscriptionRefresh = () => {
      console.log('🔄 Subscription refresh event received')
      refreshSubscription()
    }

    window.addEventListener('subscription-refresh', handleSubscriptionRefresh)

    // Also listen for storage events (for cross-tab updates)
    const handleStorageChange = (e) => {
      if (e.key === 'subscription-updated') {
        console.log('🔄 Storage change event received')
        refreshSubscription()
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('subscription-refresh', handleSubscriptionRefresh)
      window.removeEventListener('storage', handleStorageChange)
      delete window.refreshSubscription
    }
  }, [API])

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: null,
      description: 'Perfect for getting started',
      features: [
        '1 Schools/Institutes',
        '3 admins',
        '5 mentors',
        '10 students',
        '2 classes',
        '2 courses'
      ],
      buttonText: 'Get Started',
      popular: false
    },
    {
      id: 'standard',
      name: 'Standard',
      price: 1,
      description: 'Great for growing institutions',
      features: [
        '2 Schools/Institutes',
        '5 admins',
        '10 mentors',
        '200 students',
        '10 classes',
        '8 courses'
      ],
      buttonText: 'Choose Standard',
      popular: true
    },
    {
      id: 'professional',
      name: 'Professional',
      price: 1,
      description: 'Complete solution for large institutions',
      features: [
        'Unlimited Schools/Institutes',
        'Unlimited students',
        'Unlimited courses',
        '24/7 priority support',
        'Live classes',
        'Custom branding',
        'API access'
      ],
      buttonText: 'Choose Professional',
      popular: false
    }
  ]


  const cancelCurrentSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription and downgrade to Free?')) return;

    try {
      setLoading(true);
      const response = await fetch(`${API}/subscriptions/cancel`, {
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
        setCurrentSubscription(data.subscription || null);
        localStorage.setItem('superadminPlanName', 'Free');
        localStorage.setItem('superadminSubscriptionStatus', 'active');
        alert('Subscription cancelled — you have been moved to the Free plan.');
        // Refresh to update layout timer
        setTimeout(() => window.location.reload(), 500);
      } else {
        throw new Error((data && data.message) || 'Failed to cancel subscription');
      }
    } catch (err) {
      console.error('Cancel subscription error:', err);
      alert('Failed to cancel subscription: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const [loadingPlan, setLoadingPlan] = useState(null)

  const handlePlanSelect = async (plan) => {
    if (loadingPlan) return
    setLoadingPlan(plan.id)

    try {
      if (plan.id === 'free') {
        const response = await fetch(`${API}/subscriptions/activate-free-trial`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        const data = await response.json()
        if (data && data.success) {
          localStorage.setItem('superadminPlanName', 'Free')
          localStorage.setItem('superadminSubscriptionStatus', 'active')
          window.dispatchEvent(new CustomEvent('subscription-refresh'))
          alert('✅ Free Plan activated successfully!')
          setTimeout(() => {
            window.location.href = '/superadmin/dashboard'
          }, 600)
        } else {
          alert(`Error: ${data ? data.message : 'Unknown error'}`)
        }
        return
      }

      // Standard / Professional: the server creates the order at its own price; the plan
      // is activated only after the payment is verified (see activateSubscription).
      const orderRes = await fetch(`${API}/subscriptions/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ planId: plan.id })
      })
      const orderData = await orderRes.json().catch(() => ({}))

      if (orderRes.status === 503) {
        alert('Online payment is not available yet. Please contact Core5 support to upgrade your plan.')
        return
      }
      if (!orderRes.ok || !orderData.success || !orderData.order) {
        throw new Error(orderData.message || 'Could not start the payment')
      }

      await loadRazorpayScript()
      openRazorpayCheckout(plan, orderData.order)
    } catch (error) {
      console.error('Subscription error:', error)
      alert(`Upgrade failed: ${error.message}`)
    } finally {
      setLoadingPlan(null)
    }
  }

  const loadRazorpayScript = () => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true

      script.onload = () => {
        console.log('Razorpay script loaded successfully')
        resolve()
      }

      script.onerror = (error) => {
        console.error('Failed to load Razorpay script:', error)
        reject(new Error('Failed to load payment gateway'))
      }

      document.body.appendChild(script)
    })
  }

  const openRazorpayCheckout = (plan, order) => {
    try {
      if (!window.Razorpay) {
        throw new Error('Razorpay not loaded properly')
      }

      const options = {
        key: (import.meta.env.VITE_RAZORPAY_KEY_ID || ''),
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'LMS Superadmin Portal',
        description: `${plan.name} Plan Subscription`,
        handler: function (response) {
          console.log('Payment successful:', response)
          activateSubscription(plan.id, plan.name, plan.price, response)
        },
        prefill: {
          name: 'Superadmin User',
          email: 'superadmin@lms.com',
          contact: '9999999999'
        },
        theme: {
          color: '#3B82F6'
        },
        method: {
          upi: true,
          netbanking: true,
          card: true,
          wallet: true,
          emandate: false
        },
        modal: {
          ondismiss: function () {
            console.log('Payment modal dismissed')
            setLoading(false)
          },
          escape: true,
          handleback: true,
          confirm_close: true,
          animation: 'slideFromBottom'
        }
      }

      const rzp = new window.Razorpay(options)

      rzp.on('payment.failed', function (response) {
        const errorMessage = response.error?.description || 'Payment failed';
        alert(`Payment failed: ${errorMessage}`);
        setLoading(false);
      });

      rzp.open()

    } catch (error) {
      console.error('Razorpay checkout error:', error)
      alert(`Payment gateway error: ${error.message}`)
      setLoading(false)
    }
  }

  const activateSubscription = async (planId, planName, amount, response) => {
    try {
      setLoading(true)

      // Verify payment on backend
      const verifyResponse = await fetch(`${API}/subscriptions/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
          planId,
          planName,
          amount,
          durationDays: 30
        })
      });

      const rawVerify = await verifyResponse.text();

      if (!verifyResponse.ok) {
        throw new Error(`Verify payment failed: ${verifyResponse.status} ${verifyResponse.statusText} - ${rawVerify || 'no response body'}`);
      }

      if (!rawVerify || rawVerify.trim() === '') {
        throw new Error('Verify payment returned empty response');
      }

      let verifyData;
      try {
        verifyData = JSON.parse(rawVerify);
      } catch (e) {
        throw new Error('Invalid JSON from verify-payment: ' + rawVerify);
      }

      if (verifyData.success) {
        // Clear any old subscription data from localStorage
        localStorage.removeItem('superadminTimer');
        localStorage.removeItem('superadminTimerTimestamp');
        localStorage.removeItem('superadminTimerActive');
        localStorage.removeItem('superadminTimerExpired');
        localStorage.removeItem('superadminPlanName');
        localStorage.removeItem('superadminSubscriptionStatus');

        // Store subscription info in localStorage
        localStorage.setItem('superadminPlanName', planName);
        localStorage.setItem('superadminSubscriptionStatus', 'active');

        // Trigger subscription refresh event
        window.dispatchEvent(new CustomEvent('subscription-refresh'));

        // Also trigger storage event for cross-tab updates
        localStorage.setItem('subscription-updated', Date.now().toString());
        setTimeout(() => {
          localStorage.removeItem('subscription-updated');
        }, 100);

        alert(`? Congratulations! You have successfully upgraded to the ${planName} Plan!`);

        // Refresh current subscription data immediately
        setTimeout(() => {
          console.log('Triggering subscription refresh after payment...');
          if (window.refreshSubscription) {
            window.refreshSubscription();
          }
          // Also trigger custom event for immediate refresh
          window.dispatchEvent(new CustomEvent('subscription-refresh'));

          // Update local state immediately
          setPlanName(planName);

          // Redirect to dashboard after showing success
          setTimeout(() => {
            window.location.href = '/superadmin/dashboard';
          }, 2000);
        }, 500);
      } else {
        alert(`Verification failed: ${verifyData.message}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error activating subscription:', error);
      alert(`Failed to activate subscription: ${error.message}`);
      setLoading(false);
    }
  }

  return (
    <SuperAdminLayout>
      <div style={{ padding: '32px 16px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', backgroundColor: 'rgba(185, 150, 82, 0.1)', border: '1px solid #ebdcaa', marginBottom: '16px' }}>
              <Shield style={{ color: '#B99652' }} size={32} />
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#1e1b4b', marginBottom: '12px', fontFamily: "'DM Serif Display', serif" }}>
              Choose Your Plan
            </h1>
            <p style={{ fontSize: '16px', color: '#7a705a', maxWidth: '768px', margin: '0 auto', fontWeight: '500' }}>
              Select the perfect institutional plan. Start free and scale seamlessly across your empire.
            </p>
          </div>

          {/* Pricing Cards */}
          <div data-tour="subscription-plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '48px' }}>
            {plans.map((plan) => (
              <div
                key={plan.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '0px',
                  boxShadow: plan.popular 
                    ? '0 8px 30px rgba(185, 150, 82, 0.18)' 
                    : '0 4px 20px rgba(185, 150, 82, 0.08)',
                  padding: '36px 32px',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  border: plan.popular ? '2px solid #B99652' : '1.5px solid #ebdcaa',
                  transform: plan.popular ? 'scale(1.03)' : 'scale(1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 12px 35px rgba(185, 150, 82, 0.22)'
                  e.currentTarget.style.borderColor = '#B99652'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = plan.popular 
                    ? '0 8px 30px rgba(185, 150, 82, 0.18)' 
                    : '0 4px 20px rgba(185, 150, 82, 0.08)'
                  e.currentTarget.style.borderColor = plan.popular ? '#B99652' : '#ebdcaa'
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute',
                    top: '-14px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#B99652',
                    color: 'white',
                    padding: '4px 18px',
                    borderRadius: '0px',
                    fontSize: '12px',
                    fontWeight: '700',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    border: '1px solid #9b7b3e',
                    boxShadow: '0 2px 8px rgba(185, 150, 82, 0.25)'
                  }}>
                    Most Popular
                  </div>
                )}

                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '26px', fontWeight: 'bold', color: '#1e1b4b', marginBottom: '8px', fontFamily: "'DM Serif Display', serif" }}>
                    {plan.name}
                    {currentSubscription && currentSubscription.status === 'active' &&
                      (currentSubscription.planType === plan.id ||
                        currentSubscription.planName?.toLowerCase().includes(plan.name.toLowerCase())) && (
                        <span style={{
                          backgroundColor: '#fff8e7',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                          padding: '3px 10px',
                          borderRadius: '0px',
                          fontSize: '11px',
                          fontWeight: '700',
                          marginLeft: '10px',
                          display: 'inline-block',
                          verticalAlign: 'middle'
                        }}>
                          CURRENT PLAN
                        </span>
                      )}
                  </h3>
                  <p style={{ color: '#7a705a', fontSize: '14px', marginBottom: '20px' }}>{plan.description}</p>

                  {plan.price ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
                      <span style={{ fontSize: '38px', fontWeight: 'bold', color: '#1e1b4b', fontFamily: "'DM Serif Display', serif" }}>
                        ₹{plan.price.toLocaleString('en-IN')}
                      </span>
                      <span style={{ color: '#7a705a', marginLeft: '6px', fontSize: '14px', fontWeight: '500' }}>/year</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '38px', fontWeight: 'bold', color: '#1e1b4b', fontFamily: "'DM Serif Display', serif" }}>Free</div>
                  )}
                </div>

                <div style={{ marginBottom: '32px', paddingTop: '16px', borderTop: '1px solid #ebdcaa' }}>
                  {plan.features.map((feature, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '14px' }}>
                      <Check style={{ color: '#B99652', marginRight: '10px', marginTop: '2px', flexShrink: 0 }} size={18} />
                      <span style={{ color: '#4a4437', fontSize: '14px', fontWeight: '500' }}>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Show Cancel button if this is the current active paid plan */}
                {currentSubscription &&
                  currentSubscription.status === 'active' &&
                  plan.id !== 'free' &&
                  (currentSubscription.planType === plan.id ||
                    currentSubscription.planName?.toLowerCase().includes(plan.name.toLowerCase())) ? (
                  <button
                    onClick={cancelCurrentSubscription}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      borderRadius: '0px',
                      fontSize: '13px',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      border: '1px solid #ef4444',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        e.currentTarget.style.backgroundColor = '#fee2e2';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        e.currentTarget.style.backgroundColor = '#fef2f2';
                      }
                    }}
                  >
                    {loading ? (
                      <span>Cancelling...</span>
                    ) : (
                      <>
                        <X size={16} />
                        Cancel Plan
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => handlePlanSelect(plan)}
                    disabled={Boolean(loadingPlan)}
                    style={{
                      width: '100%',
                      padding: '13px 24px',
                      borderRadius: '0px',
                      fontSize: '13px',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      border: '1px solid #1e1b4b',
                      cursor: loadingPlan ? 'not-allowed' : 'pointer',
                      opacity: loadingPlan && loadingPlan !== plan.id ? 0.6 : 1,
                      backgroundColor: '#1e1b4b',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 6px rgba(30, 27, 75, 0.15)'
                    }}
                    onMouseEnter={(e) => {
                      if (!loadingPlan) {
                        e.currentTarget.style.backgroundColor = '#B99652';
                        e.currentTarget.style.borderColor = '#9b7b3e';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loadingPlan) {
                        e.currentTarget.style.backgroundColor = '#1e1b4b';
                        e.currentTarget.style.borderColor = '#1e1b4b';
                      }
                    }}
                  >
                    {loadingPlan === plan.id ? (
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        <svg style={{ animation: 'spin 1s linear infinite', marginRight: '12px', height: '18px', width: '18px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12a8 8 0 01-8 8v0a5.291 5.291 0 0010.585z"></path>
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        {currentSubscription && currentSubscription.status === 'active' &&
                          (currentSubscription.planType === plan.id ||
                            currentSubscription.planName?.toLowerCase().includes(plan.name.toLowerCase())) ?
                          'Manage Plan' :
                          plan.buttonText
                        }
                        {plan.id !== 'free' && <ArrowRight style={{ marginLeft: '8px' }} size={16} />}
                      </span>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>


        </div>
      </div>
    </SuperAdminLayout>
  )
}

export default SuperAdminSubscription
