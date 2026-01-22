import React from 'react';
import classNames from 'classnames';
import moment from 'moment';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { propTypes, LINE_ITEM_FIXED } from '../../../util/types';
import { IconDate, Modal, H6 } from '../../../components';

import RescheduleBookingForm from './RescheduleBookingForm';
import SimpleReschedulePicker from './SimpleReschedulePicker';

import css from './RescheduleBookingModal.module.css';

/**
 * Reschedule booking modal
 *
 * @component
 * @param {Object} props - The props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {string} props.id - The id
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onCloseModal - The on close modal function
 * @param {Function} props.onManageDisableScrolling - The on manage disable scrolling function
 * @param {Function} props.onSubmitReschedule - The on submit reschedule function
 * @param {boolean} props.rescheduleInProgress - Whether the reschedule is in progress
 * @param {propTypes.error} props.rescheduleError - The reschedule error
 * @param {propTypes.transaction} props.transaction - The transaction
 * @param {propTypes.listing} props.listing - The listing
 * @param {Object} props.monthlyTimeSlots - The monthly time slots
 * @param {Object} props.timeSlotsForDate - The time slots for specific dates
 * @param {Function} props.onFetchTimeSlots - The on fetch time slots function
 * @returns {JSX.Element} The RescheduleBookingModal component
 */
const RescheduleBookingModal = props => {
  const intl = useIntl();
  const {
    className,
    rootClassName,
    id,
    isOpen,
    onCloseModal,
    onManageDisableScrolling,
    onSubmitReschedule,
    rescheduleInProgress = false,
    rescheduleError,
    transaction,
    listing,
    monthlyTimeSlots,
    timeSlotsForDate,
    onFetchTimeSlots,
  } = props;

  const classes = classNames(rootClassName || css.root, className);
  const closeButtonMessage = intl.formatMessage({ id: 'RescheduleBookingModal.cancel' });

  const listingTitle = listing?.attributes?.title || '';
  const booking = transaction?.booking;
  const currentStart = booking?.attributes?.start;
  const currentEnd = booking?.attributes?.end;
  const timeZone = listing?.attributes?.availabilityPlan?.timezone;
  const unitType = transaction?.attributes?.protectedData?.unitType || LINE_ITEM_FIXED;
  const publicData = listing?.attributes?.publicData || {};
  const startTimeInterval = publicData.startTimeInterval || 'hour';
  const priceVariants = publicData.priceVariants || [];
  const priceVariantName = transaction?.attributes?.protectedData?.priceVariantName;
  
  // Get booking length from price variant or calculate from current booking
  let bookingLengthInMinutes = 60; // default
  if (priceVariantName && priceVariants.length > 0) {
    const variant = priceVariants.find(v => v.name === priceVariantName);
    if (variant?.bookingLengthInMinutes) {
      bookingLengthInMinutes = variant.bookingLengthInMinutes;
    }
  } else if (currentStart && currentEnd) {
    bookingLengthInMinutes = moment(currentEnd).diff(moment(currentStart), 'minutes');
  }

  // Add travel time to booking length for availability checks
  // This prevents customers from selecting time slots that would overlap with provider's travel time
  // Get travel time from transaction metadata (saved at booking time) or fallback to listing publicData
  const transactionMetadata = transaction?.attributes?.metadata || {};
  const travelTimeField = transactionMetadata.travelTime || publicData.travel_time;
  const timeMap = {
    travel_time_15mins: 15,
    travel_time_30mins: 30,
    travel_time_45mins: 45,
    travel_time_60mins: 60,
  };
  const travelTime = timeMap[travelTimeField] || 0;
  bookingLengthInMinutes = (bookingLengthInMinutes || 0) + travelTime;

  return (
    <Modal
      id={id}
      containerClassName={classes}
      contentClassName={css.modalContent}
      isOpen={isOpen}
      onClose={onCloseModal}
      onManageDisableScrolling={onManageDisableScrolling}
      usePortal
      closeButtonMessage={closeButtonMessage}
    >
      <IconDate className={css.modalIcon} />
      <p className={css.modalTitle}>
        <FormattedMessage id="RescheduleBookingModal.title" />
      </p>
      <p className={css.modalMessage}>
        <FormattedMessage
          id="RescheduleBookingModal.description"
          values={{ listingTitle: <strong>{listingTitle}</strong> }}
        />
      </p>

      

      <RescheduleBookingForm
        onSubmit={onSubmitReschedule}
        inProgress={rescheduleInProgress}
        error={rescheduleError}
      >
        <SimpleReschedulePicker
          timeZone={timeZone}
          listingId={listing?.id}
          monthlyTimeSlots={monthlyTimeSlots}
          timeSlotsForDate={timeSlotsForDate}
          onFetchTimeSlots={onFetchTimeSlots}
          bookingLengthInMinutes={bookingLengthInMinutes}
          startTimeInterval={startTimeInterval}
        />
      </RescheduleBookingForm>
    </Modal>
  );
};

export default RescheduleBookingModal;







