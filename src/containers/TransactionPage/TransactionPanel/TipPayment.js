import React, { useCallback, useEffect, useState } from 'react';
import { Modal, NamedRedirect } from '../../../components';
import './TipPayment.css';
import StripePaymentForm from '../../CheckoutPage/StripePaymentForm/StripePaymentForm';
import { useIntl } from 'react-intl';
import { useConfiguration } from '../../../context/configurationContext';
import { useSelector } from 'react-redux';
import { confirmStripePaymentApi, payTipApi } from '../../../util/api';
const onManageDisableScrolling = (componentId, scrollingDisabled = true) => {
  // We are just checking the value for now
  console.log('Toggling Modal - scrollingDisabled currently:', componentId, scrollingDisabled);
};
const TipPayment = ({ orderBreakdown }) => {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(0);
  const [amountTip, setAmountTip] = useState(0);

  const basePrice = orderBreakdown?.attributes?.payinTotal?.amount / 100;
  console.log('orderBreakdown', basePrice);
  useEffect(() => {
    if (tip && tip > 0) {
      setAmountTip((basePrice * tip) / 100);
    }
  }, [tip]);












    const currentUser = useSelector(state => state.user.currentUser);

    const intl = useIntl()
    const config = useConfiguration()
   
    const cancellationFine = amountTip
    const currency = config.currency || "USD"
    const [clientSecret, setClientSecret] = useState(null)
    const [loading, setLoading] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)
    const [error, setError] = useState(null)
    const [stripe, setStripe] = useState()
    const [cardElement, setCardElement] = useState()
  
    useEffect(() => {
      if (cancellationFine > 0 && currentUser?.id?.uuid) {
        setLoading(true)
        payTipApi({
          amount: Math.round(cancellationFine * 100), // assuming fine is in major units
          currency,
          userId: currentUser.id.uuid,
        })
          .then((data) => {
            if (data.clientSecret) {
              setClientSecret(data.clientSecret)
              setError(null)
            } else {
              setError(data.error || "Failed to create payment intent.")
            }
          })
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false))
      }
    }, [cancellationFine, currency, currentUser?.id?.uuid])
  
    // Remove handlePaymentSubmit and use handlePaymentSuccess for onSubmitSuccess
    const handlePaymentSuccess = useCallback(() => {
      setLoading(true)
                  setPaymentSuccess(true)

    //   clearCancellationFineApi({})
    //     .then((data) => {
    //       if (data.success) {
    //         setPaymentSuccess(true)
    //         setError(null)
    //       } else {
    //         setError(data.error || "Failed to update penalty state.")
    //       }
    //     })
    //     .catch((e) => setError(e.message))
    //     .finally(() => setLoading(false))

    }, [])
  
    // New: handle payment form submit using confirmStripePaymentApi
    const handlePaymentFormSubmit = async (values, form) => {

        console.log('hereeeeee',values,form)
        return
      setLoading(true)
      setError(null)
      try {
        if (!stripe || !clientSecret) throw new Error("Stripe not initialized")
        if (!cardElement) throw new Error("Card element not found")
        // Create a payment method
        const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
          type: "card",
          card: cardElement,
        })
        if (pmError) throw pmError
        // Retrieve the PaymentIntent to get its ID
        const piResult = await stripe.retrievePaymentIntent(clientSecret)
        const paymentIntentId = piResult && piResult.paymentIntent && piResult.paymentIntent.id
        if (!paymentIntentId) throw new Error("Could not retrieve PaymentIntent ID")
        // Confirm payment via backend
        const result = await confirmStripePaymentApi({
          clientSecret,
          paymentMethodId: paymentMethod.id,
          paymentIntentId,
          returnUrl: window.location.href,
        })
        if (result && result.paymentIntent && result.paymentIntent.status === "succeeded") {
          handlePaymentSuccess()
        } else {
          setError("Payment failed.")
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
  
    // Get the user's default payment method for Stripe
    const defaultPaymentMethod = currentUser?.stripeCustomer?.defaultPaymentMethod || null;
  

  return (
    <>
      <div classNameName="button">
        <button onClick={() => setOpen(prev => !prev)}>Tip</button>
      </div>
      {open && (
        <Modal
          id="TipPage"
          isOpen={open}
          onClose={() => setOpen(false)}
          usePortal
          onManageDisableScrolling={onManageDisableScrolling}
        >
          <section className="tip-card" aria-labelledby="tip-title">
            <h2 id="tip-title" className="tip-title">
              Would you like to leave a tip?
            </h2>

            <form className="tip-form" action="#" method="post" novalidate>
              <div className="tip-options" role="radiogroup" aria-label="Tip amount">
                <label className="tip-option">
                  <input
                    type="radio"
                    name="tip"
                    value="10"
                    onChange={e => {
                      setTip(e.target.value);
                    }}
                  />
                  <span className="label-text">10%</span>
                </label>

                <label className="tip-option">
                  <input
                    type="radio"
                    name="tip"
                    value="15"
                    onChange={e => {
                      setTip(e.target.value);
                    }}
                  />
                  <span className="label-text">15%</span>
                </label>

                <label className="tip-option">
                  <input
                    type="radio"
                    name="tip"
                    value="20"
                    onChange={e => {
                      setTip(e.target.value);
                    }}
                  />
                  <span className="label-text">20%</span>
                </label>

                <input id="tip-custom" className="sr-only" type="radio" name="tip" value="custom"  onClick={e => {
                    setAmountTip(0);
                  }} />
                <label for="tip-custom" className="tip-option custom-label">
                  <span className="label-text">Custom</span>
                </label>

                <input
                  id="custom-amount"
                  className="custom-amount"
                  name="customAmount"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="$0.00"
                  aria-label="Custom tip amount"
                  value={amountTip}
                  onChange={e => {
                    setAmountTip(e.target.value);
                  }}
                />
              </div>
              <div>Amount: {amountTip ? amountTip : 0}</div>


                 <StripePaymentForm
                                      formId="SellerPenaltyPageStripePaymentForm"
                                      stripePublishableKey={config.stripe.publishableKey}
                                      clientSecret={clientSecret}
                                      totalPrice={intl.formatNumber(cancellationFine, { style: "currency", currency })}
                                      onStripeInitialized={(stripe) => {
                                        setStripe(stripe)
                                      }}
                                      onSubmit={handlePaymentFormSubmit}
                                      onSubmitSuccess={handlePaymentSuccess}
                                      inProgress={loading}
                                      locale={config.localization?.locale || "en-US"}
                                      marketplaceName={config.marketplaceName}
                                      showInitialMessageInput={false}
                                      askShippingDetails={false}
                                      showPickUplocation={false}
                                      setCardElement={setCardElement}
                                      defaultPaymentMethod={defaultPaymentMethod}
                                    />

              <div className="tip-actions">
                <button type="submit" className="btn btn-primary">
                  Add tip
                </button>
                <button
                  type="button"
                  className="btn btn-link"
                  aria-label="No thanks"
                  onClick={() => setOpen(false)}
                >
                  No, thanks
                </button>
              </div>
            </form>
          </section>
        </Modal>
      )}
    </>
  );
};
export default TipPayment;
