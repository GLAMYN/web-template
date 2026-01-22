import React, { Component } from 'react';
import classNames from 'classnames';

import { FormattedMessage, injectIntl, intlShape } from '../../../util/reactIntl';
import { displayPrice } from '../../../util/configHelpers';
import { propTypes } from '../../../util/types';
import { userDisplayNameAsString } from '../../../util/data';
import { isMobileSafari } from '../../../util/userAgent';
import { createSlug } from '../../../util/urlHelpers';

import { AvatarLarge, Button, Modal, NamedLink, UserDisplayName } from '../../../components';

import { stateDataShape } from '../TransactionPage.stateData';
import SendMessageForm from '../SendMessageForm/SendMessageForm';

// These are internal components that make this file more readable.
import BreakdownMaybe from './BreakdownMaybe';
import DetailCardHeadingsMaybe from './DetailCardHeadingsMaybe';
import DetailCardImage from './DetailCardImage';
import DeliveryInfoMaybe from './DeliveryInfoMaybe';
import BookingLocationMaybe from './BookingLocationMaybe';
import InquiryMessageMaybe from './InquiryMessageMaybe';
import FeedSection from './FeedSection';
import ActionButtonsMaybe from './ActionButtonsMaybe';
import DiminishedActionButtonMaybe from './DiminishedActionButtonMaybe';
import PanelHeading from './PanelHeading';

import css from './TransactionPanel.module.css';
import TipPayment from './TipPayment';
import moment from 'moment';
import { transactionTransitionApi } from '../../../util/api';
import cssActivity from '../ActivityFeed/ActivityFeed.module.css';

// Helper function to get display names for different roles
const displayNames = (currentUser, provider, customer, intl) => {
  const authorDisplayName = <UserDisplayName user={provider} intl={intl} />;
  const customerDisplayName = <UserDisplayName user={customer} intl={intl} />;

  let otherUserDisplayName = '';
  let otherUserDisplayNameString = '';
  const currentUserIsCustomer =
    currentUser.id && customer?.id && currentUser.id.uuid === customer?.id?.uuid;
  const currentUserIsProvider =
    currentUser.id && provider?.id && currentUser.id.uuid === provider?.id?.uuid;

  if (currentUserIsCustomer) {
    otherUserDisplayName = authorDisplayName;
    otherUserDisplayNameString = userDisplayNameAsString(provider, '');
  } else if (currentUserIsProvider) {
    otherUserDisplayName = customerDisplayName;
    otherUserDisplayNameString = userDisplayNameAsString(customer, '');
  }

  return {
    authorDisplayName,
    customerDisplayName,
    otherUserDisplayName,
    otherUserDisplayNameString,
  };
};

/**
 * Transaction panel
 *
 * @component
 * @param {Object} props - The props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {string} props.transactionRole - The transaction role
 * @param {propTypes.listing} props.listing - The listing
 * @param {propTypes.user} props.customer - The customer
 * @param {propTypes.user} props.provider - The provider
 * @param {boolean} props.hasTransitions - Whether the transitions are shown
 * @param {propTypes.uuid} props.transactionId - The transaction id
 * @param {Array<propTypes.message>)} props.messages - The messages
 * @param {boolean} props.initialMessageFailed - Whether the initial message failed
 * @param {boolean} props.savePaymentMethodFailed - Whether the save payment method failed
 * @param {propTypes.error} props.fetchMessagesError - The fetch messages error
 * @param {boolean} props.sendMessageInProgress - Whether the send message is in progress
 * @param {propTypes.error} props.sendMessageError - The send message error
 * @param {Function} props.onOpenDisputeModal - The on open dispute modal function
 * @param {Function} props.onSendMessage - The on send message function
 * @param {stateDataShape} props.stateData - The state data
 * @param {boolean} props.showBookingLocation - Whether the booking location is shown
 * @param {React.ReactNode} props.activityFeed - The activity feed
 * @param {React.ReactNode} props.orderBreakdown - The order breakdown
 * @param {React.ReactNode} props.orderPanel - The order panel
 * @param {object} props.config - The config
 * @param {intlShape} props.intl - The intl
 * @returns {JSX.Element} The TransactionPanel component
 */
export class TransactionPanelComponent extends Component {
  constructor(props) {
    super(props);
    this.cancellationObject = this.props.transaction?.attributes?.metadata?.cancellationObject;
    this.alreadyCancelled = this.props.transaction?.attributes?.state === 'state/cancelled';
    this.state = {
      sendMessageFormFocused: false,
      cancellationFeetback: null,
    };
    this.isMobSaf = false;
    this.sendMessageFormName = 'TransactionPanel.SendMessageForm';

    this.onSendMessageFormFocus = this.onSendMessageFormFocus.bind(this);
    this.onSendMessageFormBlur = this.onSendMessageFormBlur.bind(this);
    this.onMessageSubmit = this.onMessageSubmit.bind(this);
    this.scrollToMessage = this.scrollToMessage.bind(this);

    this.openCancelModal = this.openCancelModal.bind(this);
    this.closeCancelModal = this.closeCancelModal.bind(this);
    this.handleCancelTransaction = this.handleCancelTransaction.bind(this);
  }

  componentDidMount() {
    this.isMobSaf = isMobileSafari();
  }

  onSendMessageFormFocus() {
    this.setState({ sendMessageFormFocused: true });
    if (this.isMobSaf) {
      // Scroll to bottom
      window.scroll({ top: document.body.scrollHeight, left: 0, behavior: 'smooth' });
    }
  }

  onSendMessageFormBlur() {
    this.setState({ sendMessageFormFocused: false });
  }

  onMessageSubmit(values, form) {
    const message = values.message ? values.message.trim() : null;
    const { transactionId, onSendMessage, config } = this.props;

    if (!message) {
      return;
    }
    onSendMessage(transactionId, message, config)
      .then(messageId => {
        form.reset();
        this.scrollToMessage(messageId);
      })
      .catch(e => {
        // Ignore, Redux handles the error
      });
  }

  scrollToMessage(messageId) {
    const selector = `#msg-${messageId.uuid}`;
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    }
  }

  openCancelModal() {
    this.setState({ isCancelModalOpen: true, cancelError: null });
  }

  closeCancelModal() {
    this.setState({ isCancelModalOpen: false, cancelError: null });
  }

  handleCancelTransaction() {
    const { transactionId } = this.props;
    this.setState({ cancelInProgress: true, cancelError: null });

    transactionTransitionApi({
      transactionId,
      params: {},
      cancelBy: this.props.transactionRole,
      cancellationFeedback: this.state.cancellationFeetback,
    })
      .then(() => {
        this.setState({ isCancelModalOpen: false, cancelInProgress: false });
        window.location.reload();
      })
      .catch(e => {
        this.setState({ cancelInProgress: false, cancelError: e?.message || 'Cancel failed' });
      });
  }

  render() {
    const {
      rootClassName,
      className,
      currentUser,
      transactionRole,
      listing,
      customer,
      provider,
      hasTransitions = false,
      protectedData,
      messages,
      initialMessageFailed = false,
      savePaymentMethodFailed = false,
      fetchMessagesError,
      sendMessageInProgress,
      sendMessageError,
      onOpenDisputeModal,
      onOpenRescheduleModal,
      showListingImage,
      intl,
      stateData = {},
      showBookingLocation = false,
      activityFeed,
      isInquiryProcess,
      orderBreakdown,
      orderPanel,
      config,
      hasViewingRights,
      transaction,
      showCancelButton = true,
    } = this.props;
    const isCustomer = transactionRole === 'customer';
    const isProvider = transactionRole === 'provider';

    const listingDeleted = !!listing?.attributes?.deleted;
    const isCustomerBanned = !!customer?.attributes?.banned;
    const isCustomerDeleted = !!customer?.attributes?.deleted;
    const isProviderBanned = !!provider?.attributes?.banned;
    const isProviderDeleted = !!provider?.attributes?.deleted;

    const { authorDisplayName, customerDisplayName, otherUserDisplayNameString } = displayNames(
      currentUser,
      provider,
      customer,
      intl
    );

    const deletedListingTitle = intl.formatMessage({
      id: 'TransactionPanel.deletedListingTitle',
    });

    const listingTitle = listingDeleted ? deletedListingTitle : listing?.attributes?.title;
    const firstImage = listing?.images?.length > 0 ? listing?.images[0] : null;

    const actionButtons = (
      <ActionButtonsMaybe
        showButtons={stateData.showActionButtons}
        primaryButtonProps={stateData?.primaryButtonProps}
        secondaryButtonProps={stateData?.secondaryButtonProps}
        isListingDeleted={listingDeleted}
        isProvider={isProvider}
      />
    );

    const listingType = listing?.attributes?.publicData?.listingType;
    const listingTypeConfigs = config.listing.listingTypes;
    const listingTypeConfig = listingTypeConfigs.find(conf => conf.listingType === listingType);
    const showPrice = isInquiryProcess && displayPrice(listingTypeConfig);

    const showSendMessageForm =
      !isCustomerBanned && !isCustomerDeleted && !isProviderBanned && !isProviderDeleted;

    // Only show order panel for users who have listing viewing rights, otherwise
    // show the detail card heading.
    const showOrderPanel = stateData.showOrderPanel && hasViewingRights;
    const showDetailCardHeadings = stateData.showDetailCardHeadings || !hasViewingRights;

    const deliveryMethod = protectedData?.deliveryMethod || 'none';
    const priceVariantName = protectedData?.priceVariantName;

    const classes = classNames(rootClassName || css.root, className);

    const { isCancelModalOpen, cancelInProgress, cancelError } = this.state;
    const { isConsentModalOpen, consentInProgress, consentError } = this.state;

    const currency = config.currency || 'CAD';
    const isBookingEnded = moment().isAfter(moment(this.props?.booking?.attributes?.end));

    const includedStates = ['state/accepted'];
    const transactionState = this.props.transaction.attributes.state;

    const bookingStartDate = this.props.booking?.attributes?.start;
    const timeFrame = (listing?.attributes?.publicData?.cancellation_listingfield || 0) * 24;
    // Use floating point precision (true) to match server-side logic
    const hoursUntilBooking = moment(bookingStartDate).diff(moment(), 'hours', true);
    console.log('hoursUntilBooking', hoursUntilBooking);
    const isBetweenTimeFrame = hoursUntilBooking < timeFrame;
    const isNotStarted = moment(bookingStartDate).diff(moment(), 'minutes') > 0;
    const endDate = new Date(transaction?.booking?.attributes?.start);
    const now = new Date();
    // Check if end date is valid and still in the future
    const isBeforeEndDate = endDate instanceof Date && !isNaN(endDate) && now < endDate;

    // Reschedule button - styled exactly like Cancel button, placed above it
    const rescheduleButton = 
      stateData.showRescheduleButton &&
      onOpenRescheduleModal &&
      includedStates.includes(transactionState) &&
      isNotStarted ? (
        <Button type="button" rootClassName={css.rescheduleButton} onClick={onOpenRescheduleModal}>
          <FormattedMessage id="TransactionPanel.rescheduleButton" defaultMessage="Reschedule Booking" />
        </Button>
      ) : null;

    const cancelButton =
      showCancelButton &&
      !this.alreadyCancelled &&
      includedStates.includes(transactionState) &&
      isNotStarted ? (
        <Button type="button" rootClassName={css.cancelButton} onClick={this.openCancelModal}>
          <FormattedMessage id="TransactionPanel.cancelButton" defaultMessage="Cancel Booking" />
        </Button>
      ) : null;

    return (
      <div className={classes}>
        <div className={css.container}>
          <div className={css.txInfo}>
            <DetailCardImage
              rootClassName={css.imageWrapperMobile}
              avatarWrapperClassName={css.avatarWrapperMobile}
              listingTitle={listingTitle}
              image={firstImage}
              provider={provider}
              isCustomer={isCustomer}
              showListingImage={showListingImage}
              listingImageConfig={config.layout.listingImage}
            />

            {isProvider ? (
              <div className={css.avatarWrapperProviderDesktop}>
                <AvatarLarge user={customer} className={css.avatarDesktop} />
              </div>
            ) : null}

            <PanelHeading
              processName={stateData.processName}
              processState={this.alreadyCancelled ? 'canceled' : stateData.processState}
              showExtraInfo={stateData.showExtraInfo}
              showPriceOnMobile={showPrice}
              price={listing?.attributes?.price}
              intl={intl}
              deliveryMethod={deliveryMethod}
              isPendingPayment={!!stateData.isPendingPayment}
              transactionRole={transactionRole}
              providerName={authorDisplayName}
              customerName={customerDisplayName}
              isCustomerBanned={isCustomerBanned}
              listingId={listing?.id?.uuid}
              listingTitle={listingTitle}
              listingDeleted={listingDeleted}
            />

            <InquiryMessageMaybe
              protectedData={protectedData}
              showInquiryMessage={isInquiryProcess}
              isCustomer={isCustomer}
            />

            {!isInquiryProcess ? (
              <div className={css.orderDetails}>
                <div className={css.orderDetailsMobileSection}>
                  <div className={css.orderBreakdownTitle}>
                    <b>Transaction Id:</b>{' '}
                    <span className={css.marketPlaceText}>{transaction?.id?.uuid}</span>
                  </div>
                  <BreakdownMaybe
                    orderBreakdown={orderBreakdown}
                    processName={stateData.processName}
                    priceVariantName={priceVariantName}
                    transaction={transaction}
                  />
                  <DiminishedActionButtonMaybe
                    showDispute={stateData.showDispute}
                    onOpenDisputeModal={onOpenDisputeModal}
                    showReschedule={stateData.showRescheduleButton}
                    onOpenRescheduleModal={onOpenRescheduleModal}
                    rescheduleDisabled={stateData.rescheduleDisabled}
                    rescheduleTooltip={stateData.rescheduleTooltip}
                  />
                </div>

                {savePaymentMethodFailed ? (
                  <p className={css.genericError}>
                    <FormattedMessage
                      id="TransactionPanel.savePaymentMethodFailed"
                      values={{
                        paymentMethodsPageLink: (
                          <NamedLink name="PaymentMethodsPage">
                            <FormattedMessage id="TransactionPanel.paymentMethodsPageLink" />
                          </NamedLink>
                        ),
                      }}
                    />
                  </p>
                ) : null}
                <DeliveryInfoMaybe
                  className={css.deliveryInfoSection}
                  protectedData={protectedData}
                  listing={listing}
                  locale={config.localization.locale}
                />
                <BookingLocationMaybe
                  className={css.deliveryInfoSection}
                  listing={listing}
                  showBookingLocation={showBookingLocation}
                />
              </div>
            ) : null}

            <FeedSection
              rootClassName={css.feedContainer}
              hasMessages={messages.length > 0}
              hasTransitions={hasTransitions}
              fetchMessagesError={fetchMessagesError}
              initialMessageFailed={initialMessageFailed}
              activityFeed={activityFeed}
              isConversation={isInquiryProcess}
            />
            {this.cancellationObject ? (
              <div className={classNames(css.feedContent, css.customCancelContainer)}>
                <ul className={cssActivity.root}>
                  <li className={cssActivity.transitionItem}>
                    <div className={cssActivity.transition}>
                      <div class={cssActivity.bullet}>
                        <p class={cssActivity.transitionContent}>•</p>
                      </div>
                      <div>
                        <div className={cssActivity.transitionContent}>
                          {this.cancellationObject?.cancelBy === transactionRole ? (
                            'You have'
                          ) : this.cancellationObject?.cancelBy === 'provider' ? (
                            <>{authorDisplayName} has</>
                          ) : (
                            <>{customerDisplayName} has</>
                          )}{' '}
                          cancelled the booking.
                        </div>
                        <div className={cssActivity.transitionDate}>
                          {moment(this.cancellationObject?.cancelledAt).calendar(null, {
                            sameDay: '[Today], h:mm a', // Today, 6:09 a.m.
                            nextDay: '[Tomorrow], h:mm a',
                            nextWeek: 'dddd, h:mm a',
                            lastDay: '[Yesterday], h:mm a',
                            lastWeek: '[Last] dddd, h:mm a',
                            sameElse: 'MMM D, h:mm a',
                          })}
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className={cssActivity.transitionItem}>
                    <div className={cssActivity.transition}>
                      <div class={cssActivity.bullet}>
                        <p class={cssActivity.transitionContent}>•</p>
                      </div>
                      <div>
                        <div className={cssActivity.transitionContent}>
                          {this.cancellationObject?.refundIssued
                            ? 'A full refund has been issued for this transaction.'
                            : 'No refund has been issued for this transaction.'}
                        </div>
                        <div className={cssActivity.transitionDate}>
                          {moment(this.cancellationObject?.cancelledAt).calendar(null, {
                            sameDay: '[Today], h:mm a', // Today, 6:09 a.m.
                            nextDay: '[Tomorrow], h:mm a',
                            nextWeek: 'dddd, h:mm a',
                            lastDay: '[Yesterday], h:mm a',
                            lastWeek: '[Last] dddd, h:mm a',
                            sameElse: 'MMM D, h:mm a',
                          })}
                        </div>
                      </div>
                    </div>
                  </li>
                  {this.cancellationObject?.cancellationFeedback && (
                    <li className={cssActivity.transitionItem}>
                      <div className={cssActivity.transition}>
                        <div class={cssActivity.bullet}>
                          <p class={cssActivity.transitionContent}>•</p>
                        </div>
                        <div>
                          <div className={cssActivity.transitionContent}>
                            {this.cancellationObject?.cancellationFeedback && (
                              <div className={css.cancellationMessage}>
                                <div>Cancellation Feedback:</div>
                                {this.cancellationObject?.cancellationFeedback}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <></>
            )}
            {showSendMessageForm ? (
              <SendMessageForm
                formId={this.sendMessageFormName}
                rootClassName={css.sendMessageForm}
                messagePlaceholder={intl.formatMessage(
                  { id: 'TransactionPanel.sendMessagePlaceholder' },
                  { name: otherUserDisplayNameString }
                )}
                inProgress={sendMessageInProgress}
                sendMessageError={sendMessageError}
                onFocus={this.onSendMessageFormFocus}
                onBlur={this.onSendMessageFormBlur}
                onSubmit={this.onMessageSubmit}
              />
            ) : (
              <div className={css.sendingMessageNotAllowed}>
                <FormattedMessage id="TransactionPanel.sendingMessageNotAllowed" />
              </div>
            )}

            {stateData.showActionButtons ? (
              <>
                <div className={css.mobileActionButtonSpacer}></div>
                <div className={css.mobileActionButtons}>
                  {actionButtons}
                </div>
              </>
            ) : null}
            
            {/* Reschedule and Cancel buttons for mobile only */}
            <div className={css.mobileButtonsContainer}>
              {rescheduleButton}
              {cancelButton}
            </div>
          </div>

          <div className={css.asideDesktop}>
            <div className={css.stickySection}>
              <div className={css.detailCard}>
                <DetailCardImage
                  avatarWrapperClassName={css.avatarWrapperDesktop}
                  listingTitle={listingTitle}
                  image={firstImage}
                  provider={provider}
                  isCustomer={isCustomer}
                  showListingImage={showListingImage}
                  listingImageConfig={config.layout.listingImage}
                />

                <DetailCardHeadingsMaybe
                  showDetailCardHeadings={showDetailCardHeadings}
                  showListingImage={showListingImage}
                  listingTitle={
                    listingDeleted ? (
                      listingTitle
                    ) : (
                      <NamedLink
                        name="ListingPage"
                        params={{ id: listing.id?.uuid, slug: createSlug(listingTitle) }}
                      >
                        {listingTitle}
                      </NamedLink>
                    )
                  }
                  showPrice={showPrice}
                  price={listing?.attributes?.price}
                  intl={intl}
                />
                {showOrderPanel ? orderPanel : null}
                <div className={css.orderBreakdownTitle}>
                  <b>Transaction Id:</b>{' '}
                  <span className={css.marketPlaceText}>{transaction?.id?.uuid}</span>
                </div>
                <BreakdownMaybe
                  className={css.breakdownContainer}
                  orderBreakdown={orderBreakdown}
                  processName={stateData.processName}
                  priceVariantName={priceVariantName}
                  transaction={transaction}
                  listing={listing}
                />

                {stateData.showActionButtons ? (
                  <div className={css.desktopActionButtons}>{actionButtons}</div>
                ) : null}
              </div>
              
              {/* Reschedule and Cancel buttons for desktop only */}
              <div className={css.desktopButtonsContainer}>
                {rescheduleButton}
                {cancelButton}
              </div>

              <DiminishedActionButtonMaybe
                showDispute={stateData.showDispute}
                onOpenDisputeModal={onOpenDisputeModal}
              />
              {transaction?.attributes?.metadata?.tipAmount ? (
                <></>
              ) : // <div className={css.tipContainer}>
              //   <div className={css.tipIconWrapper}>
              //     <svg
              //       style={{ fill: 'none', color: '#fff' }}
              //       width="20"
              //       height="20"
              //       viewBox="0 0 24 24"
              //       fill="none"
              //       stroke="currentColor"
              //       strokeWidth="2"
              //       strokeLinecap="round"
              //       strokeLinejoin="round"
              //     >
              //       <path d="M20 6 9 17l-5-5" />
              //     </svg>
              //   </div>
              //   <div className={css.tipContent}>
              //     {isProvider ?
              //     <>
              //     <span className={css.tipLabel}>You've recieved a tip of </span>
              //     <span className={css.tipAmount}>
              //       {intl.formatNumber(+transaction?.attributes?.metadata?.tipAmount, {
              //         style: 'currency',
              //         currency,
              //       })}
              //     </span></>
              //     :
              //     <>
              //     <span className={css.tipLabel}>You tipped</span>
              //     <span className={css.tipAmount}>
              //       {intl.formatNumber(+transaction?.attributes?.metadata?.tipAmount, {
              //         style: 'currency',
              //         currency,
              //       })}
              //     </span>
              //     </>
              //     }
              //   </div>
              // </div>
              isCustomer &&
                transaction?.attributes?.lastTransition === 'transition/accept' &&
                isBookingEnded ? (
                <TipPayment
                  orderBreakdown={transaction}
                  provider={provider}
                  transactionId={transaction?.id?.uuid}
                />
              ) : (
                ''
              )}
            </div>
          </div>
        </div>
        {/* Cancel Modal */}
        <Modal
          id="CancelTransactionModal"
          isOpen={isCancelModalOpen}
          onClose={this.closeCancelModal}
          onManageDisableScrolling={() => {}}
          containerClassName={css.cancelModalRoot}
          contentClassName={css.cancelModalContent}
        >
          <p className={css.modalTitle}>
            <FormattedMessage
              id="TransactionPanel.cancelModal.title"
              defaultMessage="Cancel Transaction"
            />
          </p>
          <p className={css.modalMessage}>
            <FormattedMessage
              id="TransactionPanel.cancelModal.message"
              defaultMessage="Are you sure you want to cancel this transaction?"
            />
            {isBetweenTimeFrame && (
              <div className={css.cancelModalDescription}>
                {isProvider
                  ? 'Warning: Customer will be refunded an you will not get any money.'
                  : 'Warning: You will not get any refund.'}
              </div>
            )}
          </p>
          <div className={css.cancellationFeedbackContainer}>
            <label>Cancellation Feedback (optional)</label>
            <textarea
              onChange={e => this.setState({ cancellationFeetback: e.target.value })}
              className={css.cancellationFeedback}
            />
          </div>
          {cancelError ? <p className={css.actionError}>{cancelError}</p> : null}
          <div className={css.cancelModalActions}>
            <Button
              type="button"
              inProgress={cancelInProgress}
              onClick={() => this.handleCancelTransaction()}
              className={css.cancelDirectly}
            >
              <FormattedMessage
                id="TransactionPanel.cancelModal.cancelDirect"
                defaultMessage="Cancel"
              />
            </Button>
          </div>
        </Modal>
      </div>
    );
  }
}

const TransactionPanel = injectIntl(TransactionPanelComponent);

export default TransactionPanel;
