import React, { useCallback, useEffect, useState } from 'react';
import { Modal, NamedRedirect, Button, IconCheckmark, IconSpinner } from '../../../components';
import css from './TipPayment.module.css';
import StripePaymentForm from '../../CheckoutPage/StripePaymentForm/StripePaymentForm';
import { useIntl } from 'react-intl';
import { useConfiguration } from '../../../context/configurationContext';
import { useSelector } from 'react-redux';
import { confirmStripePaymentApi, createTipIntent, payTipApi } from '../../../util/api';

const onManageDisableScrolling = (componentId, scrollingDisabled = true) => {
  // We are just checking the value for now
  console.log('Toggling Modal - scrollingDisabled currently:', componentId, scrollingDisabled);
};

const TipPayment = ({ orderBreakdown, provider, transactionId }) => {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(0);
  const [amountTip, setAmountTip] = useState(0);
  const [customAmount, setCustomAmount] = useState('');

  const basePrice = orderBreakdown?.attributes?.payinTotal?.amount / 100;

  const currentUser = useSelector(state => state.user.currentUser);
  const intl = useIntl();
  const config = useConfiguration();

  const currency = config.currency || 'USD';
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [error, setError] = useState(null);
  const [stripe, setStripe] = useState();
  const [cardElement, setCardElement] = useState();

  // Calculate tip amount when tip percentage or custom amount changes
  useEffect(() => {
    if (tip && tip > 0 && tip !== 'custom') {
      setAmountTip((basePrice * tip) / 100);
      setCustomAmount('');
    } else if (tip === 'custom' && customAmount) {
      setAmountTip(parseFloat(customAmount) || 0);
    } else {
      setAmountTip(0);
    }
  }, [tip, customAmount, basePrice]);

  // Create payment intent when amount changes
  useEffect(() => {
    if (amountTip > 0 && currentUser?.id?.uuid && provider?.id?.uuid) {
      setLoading(true);
      setError(null);

      console.log('Creating payment intent with:', {
        amount: amountTip,
        customerEmail: currentUser.attributes?.email,
        providerId: provider.id.uuid,
      });

      createTipIntent({
        amount: amountTip,
        customerEmail: currentUser.attributes?.email,
        providerId: provider.id.uuid,
      })
        .then(data => {
          console.log('Payment intent created:', data);
          if (data.success && data.paymentIntent) {
            setClientSecret(data.paymentIntent.client_secret);
            setPaymentIntentId(data.paymentIntent.id);
            setError(null);
          } else {
            setError(data.error || 'Failed to create payment intent.');
          }
        })
        .catch(e => {
          console.error('Payment intent creation error:', e);
          setError(e.message || 'Failed to create payment intent.');
        })
        .finally(() => setLoading(false));
    } else {
      setClientSecret(null);
    }
  }, [amountTip, currentUser?.id?.uuid, provider?.id?.uuid]);

  const handlePaymentSuccess = useCallback(() => {
    setLoading(true);
    setPaymentSuccess(true);
    setShowSuccessMessage(true);
    
    // Show success message for 3 seconds, then refresh the page
    setTimeout(() => {
      setShowSuccessMessage(false);
      setPaymentSuccess(false);
      setAmountTip(0);
      setTip(0);
      setCustomAmount('');
      setOpen(false);
      
      // Refresh the page after 3 seconds
      window.location.reload();
    }, 3000);
  }, []);

  const handlePaymentFormSubmit = async values => {
    setLoading(true);
    setError(null);

    try {
      if (!stripe || !clientSecret) {
        throw new Error('Stripe not initialized or client secret missing');
      }
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Create a payment method
      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (pmError) {
        console.error('Payment method creation error:', pmError);
        throw pmError;
      }

      // Confirm payment via backend
      const result = await confirmStripePaymentApi({
        clientSecret,
        paymentMethodId: paymentMethod.id,
        paymentIntentId,
        returnUrl: window.location.href,
        transactionId: transactionId,
        amount: amountTip,
      });
      if (result && result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        handlePaymentSuccess();
      } else {
        setError('Payment failed.');
      }
    } catch (e) {
      console.error('Payment error:', e);
      setError(e.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  // Get the user's default payment method for Stripe
  const defaultPaymentMethod = currentUser?.stripeCustomer?.defaultPaymentMethod || null;

  const handleTipSelection = selectedTip => {
    setTip(selectedTip);
    if (selectedTip !== 'custom') {
      setCustomAmount('');
    }
  };

  const handleCustomAmountChange = e => {
    const value = e.target.value;
    setCustomAmount(value);
    if (tip === 'custom') {
      setAmountTip(parseFloat(value) || 0);
    }
  };

  const formatCurrency = amount => {
    return intl.formatNumber(amount, {
      style: 'currency',
      currency: currency,
    });
  };

  const tipOptions = [
    { value: 10, label: '10%', description: 'Standard', icon: '🙂' },
    { value: 15, label: '15%', description: 'Good', icon: '😃' },
    { value: 20, label: '20%', description: 'Great', icon: '🤩' },
  ];

  return (
    <>
      <div className={css.tipButtonContainer}>
        <Button
          rootClassName={css.tipButton}
          onClick={() => setOpen(prev => !prev)}
          disabled={loading}
        >
          {loading ? (
            <>
              <IconSpinner rootClassName={css.spinner} />
              Processing...
            </>
          ) : (
            <>
              {/* <IconCheckmark rootClassName={css.tipIcon} /> */}
              Leave a Tip
            </>
          )}
        </Button>
      </div>

      {open && (
        <Modal
          id="TipPage"
          isOpen={open}
          onClose={() => setOpen(false)}
          usePortal
          onManageDisableScrolling={onManageDisableScrolling}
        >
          <div className={css.tipModalContainer}>
            <div className={css.tipHeader}>
              <div className={css.tipIconContainer}>
                <svg
                  style={{ fill: 'none', color: '#fff' }}
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {/* <IconCheckmark rootClassName={css.headerIcon} /> */}
              </div>
              <h2 className={css.tipTitle}>Show your appreciation</h2>
              <p className={css.tipSubtitle}>Leave a tip for exceptional service</p>
            </div>

            <div className={css.tipOptionsContainer}>
              <div className={css.tipOptions} role="radiogroup" aria-label="Tip amount">
                {tipOptions.map(option => (
                  <label key={option.value} className={css.tipOption}>
                    <input
                      type="radio"
                      name="tip"
                      value={option.value}
                      checked={tip === option.value}
                      onChange={e => handleTipSelection(parseInt(e.target.value))}
                      className={css.tipRadio}
                    />
                    <div className={css.tipOptionContent}>
                      <span className={css.tipPercentage}>{option.label}</span>
                      <span className={css.tipDescription}>{option.description}</span>
                      <span className={css.tipDescription}>{option.icon}</span>
                    </div>
                  </label>
                ))}

                <label className={`${css.tipOption} ${css.customTipOption}`}>
                  <input
                    id="tip-custom"
                    type="radio"
                    name="tip"
                    value="custom"
                    checked={tip === 'custom'}
                    onChange={() => handleTipSelection('custom')}
                    className={css.tipRadio}
                  />
                  <div className={css.tipOptionContent}>
                    <span className={css.tipPercentage}>Custom</span>
                    <span className={css.tipDescription}>Your choice</span>
                  </div>
                </label>
              </div>

              {tip === 'custom' && (
                <div className={css.customAmountContainer}>
                  <label htmlFor="custom-amount" className={css.customAmountLabel}>
                    Enter custom amount
                  </label>
                  <div className={css.customAmountInputWrapper}>
                    <span className={css.currencySymbol}>
                      {currency === 'USD' ? '$' : currency}
                    </span>
                    <input
                      id="custom-amount"
                      className={css.customAmountInput}
                      name="customAmount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      aria-label="Custom tip amount"
                      value={customAmount}
                      onChange={handleCustomAmountChange}
                    />
                  </div>
                </div>
              )}
            </div>

            {amountTip > 0 && (
              <div className={css.tipAmountDisplay}>
                <div className={css.tipAmountContent}>
                  <span className={css.tipAmountLabel}>Tip Amount:</span>
                  <span className={css.tipAmountValue}>{formatCurrency(amountTip)}</span>
                </div>
                <div className={css.tipAmountBreakdown}>
                  <span>Base: {formatCurrency(basePrice)}</span>
                  <span>+ Tip: {formatCurrency(amountTip)}</span>
                  <span className={css.totalAmount}>
                    Total: {formatCurrency(basePrice + amountTip)}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className={css.errorMessage}>
                <div className={css.errorIcon}>❌</div>
                <span className={css.errorText}>{error}</span>
              </div>
            )}

            {showSuccessMessage && (
              <div className={css.successMessage}>
                <IconCheckmark rootClassName={css.successIcon} />
                <div className={css.successContent}>
                  <span className={css.successTitle}>Payment successful!</span>
                  <span className={css.successSubtitle}>Thank you for your tip. Page will refresh in a moment...</span>
                </div>
              </div>
            )}

            {clientSecret && amountTip > 0 && (
              <div className={css.paymentFormContainer}>
                <StripePaymentForm
                  formId="TipPaymentStripePaymentForm"
                  stripePublishableKey={config.stripe.publishableKey}
                  clientSecret={clientSecret}
                  totalPrice={formatCurrency(amountTip)}
                  onStripeInitialized={stripe => {
                    setStripe(stripe);
                  }}
                  onSubmit={handlePaymentFormSubmit}
                  onSubmitSuccess={handlePaymentSuccess}
                  inProgress={loading}
                  locale={config.localization?.locale || 'en-US'}
                  marketplaceName={config.marketplaceName}
                  showInitialMessageInput={false}
                  askShippingDetails={false}
                  showPickUplocation={false}
                  defaultPaymentMethod={defaultPaymentMethod}
                  setCardElement={setCardElement}
                />
              </div>
            )}

            <div className={css.tipActions}>
              <Button
                // rootClassName={css.cancelButton}
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                No, thanks
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default TipPayment;
