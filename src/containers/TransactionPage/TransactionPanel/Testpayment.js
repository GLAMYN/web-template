"use client"

import { useEffect, useState, useCallback } from "react"
import { bool, object } from "prop-types"
import { connect } from "react-redux"
import { compose } from "redux"
import { FormattedMessage, useIntl } from "react-intl"
import TopbarContainer from "../TopbarContainer/TopbarContainer"
import FooterContainer from "../FooterContainer/FooterContainer"
import StripePaymentForm from "../CheckoutPage/StripePaymentForm/StripePaymentForm"
import { useConfiguration } from "../../context/configurationContext"
import { NamedRedirect, Page } from "../../components"
import { payCancellationFineApi, confirmStripePaymentApi, clearCancellationFineApi } from "../../util/api"
import styles from "./SellerPenaltyPage.module.css"

const SellerPenaltyPageComponent = (props) => {
  const { currentUser, scrollingDisabled } = props
  const intl = useIntl()
  const config = useConfiguration()
  const accountOnHold = currentUser?.attributes?.profile?.publicData?.accountOnHold
  const cancellationFine = currentUser?.attributes?.profile?.publicData?.cancellationFine || 0
  const currency = config.currency || "USD"
  const [clientSecret, setClientSecret] = useState(null)
  const [loading, setLoading] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [stripe, setStripe] = useState()
  const [cardElement, setCardElement] = useState()

  // Redirect if not on hold
  if (!accountOnHold) {
    return <NamedRedirect name="LandingPage" />;
  }

  // Fetch PaymentIntent client secret if fine > 0
  useEffect(() => {
    if (cancellationFine > 0 && currentUser?.id?.uuid) {
      setLoading(true)
      payCancellationFineApi({
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
    clearCancellationFineApi({})
      .then((data) => {
        if (data.success) {
          setPaymentSuccess(true)
          setError(null)
        } else {
          setError(data.error || "Failed to update penalty state.")
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // New: handle payment form submit using confirmStripePaymentApi
  const handlePaymentFormSubmit = async (values, form) => {
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

  // Render payment form if fine > 0

  if (cancellationFine > 0) {
    return (
      <Page title="Seller Penalty" scrollingDisabled={scrollingDisabled}>
        <div className={styles.root}>
          <div className={styles.layoutWrapper}>
            <TopbarContainer />
            <main className={styles.main}>
              <div className={styles.container}>
                <div className={styles.header}>
                  <div className={styles.icon}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-icon lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h1 className={styles.title}>
                    <FormattedMessage id="SellerPenaltyPage.title" defaultMessage="Your account is on hold" />
                  </h1>
                  <p className={styles.subtitle}>
                    <FormattedMessage
                      id="SellerPenaltyPage.fineMessage"
                      defaultMessage={`To reactivate your account, a $${cancellationFine} cancellation fine must be paid.`}
                    />
                  </p>
                </div>

                <div className={styles.content}>
                  <div className={styles.amountCard}>
                    <div className={styles.amountLabel}>
                      <FormattedMessage id="SellerPenaltyPage.fineLabel" defaultMessage="Penalty amount:" />
                    </div>
                    <div className={styles.amountValue}>
                      {intl.formatNumber(cancellationFine, { style: "currency", currency })}
                    </div>
                  </div>

                  {loading && (
                    <div className={styles.loading}>
                      <div className={styles.spinner}></div>
                      <FormattedMessage id="SellerPenaltyPage.loading" defaultMessage="Loading..." />
                    </div>
                  )}

                  {error && (
                    <div className={styles.error}>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                      </svg>
                      {error}
                    </div>
                  )}

                  {paymentSuccess ? (
                    <div className={styles.success}>
                      <div className={styles.successIcon}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                        </svg>
                      </div>
                      <div className={styles.successContent}>
                        <h3>Payment Successful!</h3>
                        <p>
                          <FormattedMessage
                            id="SellerPenaltyPage.success"
                            defaultMessage="Thank you! Your payment was successful and your account is now active."
                          />
                        </p>
                      </div>
                    </div>
                  ) : clientSecret ? (
                    <div className={styles.paymentForm}>
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
                    </div>
                  ) : null}
                </div>
              </div>
            </main>
            <FooterContainer />
          </div>
        </div>
      </Page>
    )
  }

  // Default penalty message if no fine
  return (
    <Page title="Seller Penalty" scrollingDisabled={scrollingDisabled}>
      <div className={styles.root}>
        <div className={styles.background}>
          <div className={`${styles.decoration} ${styles.decoration1}`}></div>
          <div className={`${styles.decoration} ${styles.decoration2}`}></div>
        </div>

        <div className={styles.layoutWrapper}>
          <TopbarContainer />
          <main className={styles.main}>
            <div className={styles.container}>
              <div className={styles.header}>
                <div className={`${styles.icon} ${styles.iconWarning}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </div>
                <h1 className={styles.title}>
                  <FormattedMessage id="SellerPenaltyPage.title" defaultMessage="Your account is on hold" />
                </h1>
                <p className={styles.subtitle}>
                  <FormattedMessage
                    id="SellerPenaltyPage.message"
                    defaultMessage="Your account has been put on hold due to a penalty. Please contact support for more information."
                  />
                </p>
              </div>
            </div>
          </main>
          <FooterContainer />
        </div>
      </div>
    </Page>
  )
}

SellerPenaltyPageComponent.propTypes = {
  currentUser: object,
  scrollingDisabled: bool,
}

const mapStateToProps = (state) => ({
  currentUser: state.user.currentUser,
  scrollingDisabled: state.ui && state.ui.scrollingDisabled,
})

const SellerPenaltyPage = compose(connect(mapStateToProps))(SellerPenaltyPageComponent)

export default SellerPenaltyPage
