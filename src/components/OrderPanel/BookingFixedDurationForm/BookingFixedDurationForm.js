import React, { useState, useEffect } from 'react';
import { Form as FinalForm, Field } from 'react-final-form';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { timestampToDate } from '../../../util/dates';
import { propTypes } from '../../../util/types';
import { BOOKING_PROCESS_NAME } from '../../../transactions/transaction';
import { types as sdkTypes } from '../../../util/sdkLoader';
import { formatMoney } from '../../../util/currency';

import {
  Form,
  H6,
  PrimaryButton,
  FieldSelect,
  FieldLocationAutocompleteInput,
  FieldTextInput,
  IconArrowHead,
} from '../../../components';

import EstimatedCustomerBreakdownMaybe from '../EstimatedCustomerBreakdownMaybe';
import FieldDateAndTimeInput from './FieldDateAndTimeInput';
import CouponCodeField from '../CouponCodeField/CouponCodeField';

import FetchLineItemsError from '../FetchLineItemsError/FetchLineItemsError.js';

import css from './BookingFixedDurationForm.module.css';
import {
  autocompletePlaceSelected,
  autocompleteSearchRequired,
  composeValidators,
} from '../../../util/validators.js';
import * as validators from '../../../util/validators';

const identity = v => v;
const { Money } = sdkTypes;

const formatDuration = minutes => {
  const hrs = Math.floor((minutes || 0) / 60);
  const mins = (minutes || 0) % 60;
  if (hrs && mins) return `${hrs}h ${mins}m`;
  if (hrs) return `${hrs}h`;
  return `${mins}m`;
};

// When the values of the form are updated we need to fetch
// lineItems from this template's backend for the EstimatedTransactionMaybe
// In case you add more fields to the form, make sure you add
// the values here to the orderData object.
const handleFetchLineItems = props => formValues => {
  const {
    listingId,
    isOwnListing,
    fetchLineItemsInProgress,
    onFetchTransactionLineItems,
    seatsEnabled,
    listing,
  } = props;
  const {
    bookingStartTime,
    bookingEndTime,
    seats,
    priceVariantName,
    priceVariantNames = [],
    coupon,
  } = formValues.values;
  const allVariants = listing?.attributes?.publicData?.priceVariants;
  let selectedVariants = [];
  let totalTimeInMinutes = 0;

  // Handle single price variant case
  if (priceVariantNames && priceVariantNames.length > 0) {
    // Multiple price variants selected
    selectedVariants = allVariants?.filter(v => priceVariantNames?.includes(v.name));
    totalTimeInMinutes = selectedVariants?.reduce((total, item) => {
      return total + (item?.bookingLengthInMinutes || 0);
    }, 0);
  } else if (priceVariantName && allVariants) {
    // Single price variant case
    const singleVariant = allVariants.find(v => v.name === priceVariantName);
    if (singleVariant) {
      selectedVariants = [singleVariant];
      totalTimeInMinutes = singleVariant?.bookingLengthInMinutes || 0;
    }
  }

  const startDate = bookingStartTime ? timestampToDate(bookingStartTime) : null;

  // Calculate endDate based on startDate + totalTimeInMinutes
  let endDate = null;
  const timeMap = {
    travel_time_15mins: 15,
    travel_time_30mins: 30,
    travel_time_45mins: 45,
    travel_time_60mins: 60,
  };
  const publicData = listing?.attributes?.publicData;
  const travelTime = timeMap[publicData?.travel_time] || 0;
  totalTimeInMinutes += travelTime;
  if (startDate && totalTimeInMinutes > 0) {
    endDate = new Date(startDate.getTime() + (totalTimeInMinutes + travelTime) * 60000);
    console.log(
      'handleFetchLineItems - Calculated endDate:',
      endDate,
      'from totalTimeInMinutes:',
      totalTimeInMinutes
    );
  }

  // Note: we expect values bookingStartTime and bookingEndTime to be strings
  // which is the default case when the value has been selected through the form
  const isStartBeforeEnd = startDate && endDate && startDate < endDate;
  const seatsMaybe = seatsEnabled && seats > 0 ? { seats: parseInt(seats, 10) } : {};

  const priceVariantMaybe = priceVariantName ? { priceVariantName } : {};
  const priceVariantNamesMaybe =
    priceVariantNames && priceVariantNames.length > 0 ? { priceVariantNames } : {};
  // Include both coupon object and couponCode for backward compatibility
  const couponMaybe = coupon
    ? {
        coupon,
        couponCode: coupon.code,
      }
    : {};

  if (startDate && endDate && isStartBeforeEnd && !fetchLineItemsInProgress) {
    const orderData = {
      bookingStart: startDate,
      bookingEnd: endDate,
      ...seatsMaybe,
      ...priceVariantMaybe,
      ...priceVariantNamesMaybe,
      ...couponMaybe,
    };

    onFetchTransactionLineItems({
      orderData,
      listingId,
      isOwnListing,
    });
  }
};

const onPriceVariantChange = props => value => {
  const { form: formApi, seatsEnabled } = props;

  formApi.batch(() => {
    formApi.change('bookingStartDate', null);
    formApi.change('bookingStartTime', null);
    formApi.change('bookingEndTime', null);
    if (seatsEnabled) {
      formApi.change('seats', 1);
    }
  });
};

const onPriceVariantNamesChange = props => value => {
  const { form: formApi, listing } = props;
  formApi.batch(() => {
    formApi.change('priceVariantNames', value);

    // Recalculate end time when price variants change
    const currentValues = formApi.getState().values;
    const startTime = currentValues?.bookingStartTime;

    if (startTime && value && value.length > 0) {
      const allVariants = listing?.attributes?.publicData?.priceVariants;
      const selectedVariants = allVariants?.filter(v => value?.includes(v.name));
      const totalTimeInMinutes = selectedVariants?.reduce((total, item) => {
        return total + (item?.bookingLengthInMinutes || 0);
      }, 0);

      if (totalTimeInMinutes > 0) {
        const startDate = timestampToDate(startTime);
        const endDate = new Date(startDate.getTime() + totalTimeInMinutes * 60000);
        formApi.change('bookingEndTime', endDate.getTime());
      }
    }
  });
};

/**
 * A form for selecting booking time.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {propTypes.money} props.price - The unit price of the listing
 * @param {boolean} props.isOwnListing - Whether the listing is owned by the current user
 * @param {propTypes.uuid} props.listingId - The ID of the listing
 * @param {Array<Object>} [props.priceVariants] - The price variants for the fixed bookings
 * @param {Object} props.monthlyTimeSlots - The monthly time slots
 * @param {Function} props.onFetchTimeSlots - The function to fetch the time slots
 * @param {string} props.timeZone - The time zone of the listing (e.g. "America/New_York")
 * @param {Function} props.onFetchTransactionLineItems - The function to fetch the transaction line items
 * @param {Object} props.lineItems - The line items
 * @param {boolean} props.fetchLineItemsInProgress - Whether line items are being fetched
 * @param {propTypes.error} props.fetchLineItemsError - The error for fetching line items
 * @param {string} [props.startDatePlaceholder] - The placeholder text for the start date
 * @param {number} props.dayCountAvailableForBooking - Number of days available for booking
 * @param {string} props.marketplaceName - Name of the marketplace
 * @param {Array<Object>} [props.priceVariants] - The price variants
 * @param {ReactNode} [props.priceVariantFieldComponent] - The component to use for the price variant field
 * @param {boolean} props.isPublishedListing - Whether the listing is published
 * @returns {JSX.Element}
 */
export const BookingFixedDurationForm = props => {
  const intl = useIntl();
  const {
    rootClassName,
    className,
    price: unitPrice,
    dayCountAvailableForBooking,
    marketplaceName,
    seatsEnabled,
    isPriceVariationsInUse,
    priceVariants = [],
    priceVariantFieldComponent: PriceVariantFieldComponent,
    preselectedPriceVariant,
    isPublishedListing,
    listing,
    ...rest
  } = props;

  const [seatsOptions, setSeatsOptions] = useState([1]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(true);
  const initialValuesMaybe =
    priceVariants.length > 1 && preselectedPriceVariant
      ? { initialValues: { priceVariantName: preselectedPriceVariant?.name } }
      : priceVariants.length === 1
      ? { initialValues: { priceVariantName: priceVariants?.[0]?.name || null } }
      : {};

  const minDurationStartingInInterval = priceVariants.reduce((min, priceVariant) => {
    return Math.min(min, priceVariant.bookingLengthInMinutes);
  }, Number.MAX_SAFE_INTEGER);

  const classes = classNames(rootClassName || css.root, className);
  return (
    <FinalForm
      {...initialValuesMaybe}
      {...rest}
      unitPrice={unitPrice}
      render={formRenderProps => {
        const {
          startDatePlaceholder,
          form,
          pristine,
          handleSubmit,
          isOwnListing,
          listingId,
          startTimeInterval,
          values,
          monthlyTimeSlots,
          timeSlotsForDate,
          onFetchTimeSlots,
          timeZone,
          lineItems,
          fetchLineItemsInProgress,
          fetchLineItemsError,
          payoutDetailsWarning,
        } = formRenderProps;

        const startTime = values?.bookingStartTime ? values.bookingStartTime : null;
        const startDate = startTime ? timestampToDate(startTime) : null;
        const priceVariantName = values?.priceVariantName || null;
        const priceVariantNames = values?.priceVariantNames || null;

        // Calculate endDate based on startDate + totalTimeInMinutes (same logic as handleFetchLineItems)
        let endDate = null;
        if (startDate) {
          const allVariants = listing?.attributes?.publicData?.priceVariants;
          let totalTimeInMinutes = 0;

          // Handle multiple price variants case
          if (priceVariantNames && priceVariantNames.length > 0) {
            const selectedVariants = allVariants?.filter(v => priceVariantNames?.includes(v.name));
            totalTimeInMinutes = selectedVariants?.reduce((total, item) => {
              return total + (item?.bookingLengthInMinutes || 0);
            }, 0);
          }
          // Handle single price variant case
          else if (priceVariantName && allVariants) {
            const singleVariant = allVariants.find(v => v.name === priceVariantName);
            if (singleVariant) {
              totalTimeInMinutes = singleVariant?.bookingLengthInMinutes || 0;
            }
          }
          const timeMap = {
            travel_time_15mins: 15,
            travel_time_30mins: 30,
            travel_time_45mins: 45,
            travel_time_60mins: 60,
          };
          const publicData = listing?.attributes?.publicData;
          const travelTime = timeMap[publicData?.travel_time] || 0;
          totalTimeInMinutes += travelTime;

          if (totalTimeInMinutes > 0) {
            endDate = new Date(startDate.getTime() + totalTimeInMinutes * 60000);
            console.log(
              'Render function - Calculated endDate:',
              endDate,
              'from totalTimeInMinutes:',
              totalTimeInMinutes
            );
          }
        }

        // This is the place to collect breakdown estimation data. See the
        // EstimatedCustomerBreakdownMaybe component to change the calculations
        // for customized payment processes.
        const breakdownData =
          startDate && endDate
            ? {
                startDate,
                endDate,
              }
            : null;

        const showEstimatedBreakdown =
          breakdownData && lineItems && !fetchLineItemsInProgress && !fetchLineItemsError;

        const onHandleFetchLineItems = handleFetchLineItems(props);
        const submitDisabled = isPriceVariationsInUse && !isPublishedListing;

        // Handle coupon application
        const handleCouponApplied = coupon => {
          setAppliedCoupon(coupon);
          // Refetch line items with coupon data
          if (startTime && endDate) {
            onHandleFetchLineItems({
              values: {
                priceVariantName,
                priceVariantNames,
                bookingStartDate: startDate,
                bookingStartTime: startTime,
                bookingEndDate: endDate,
                bookingEndTime: endDate.getTime(),
                seats: values?.seats,
                coupon: coupon,
              },
            });
          }
        };

        // Handle coupon removal
        const handleCouponRemoved = () => {
          setAppliedCoupon(null);
          // Refetch line items without coupon
          if (startTime && endDate) {
            onHandleFetchLineItems({
              values: {
                priceVariantName,
                bookingStartDate: startDate,
                bookingStartTime: startTime,
                bookingEndDate: endDate,
                bookingEndTime: endDate.getTime(),
                seats: values?.seats,
                priceVariantNames,
              },
            });
          }
        };

        const addressRequiredMessage = intl.formatMessage({
          id: 'EditListingLocationForm.addressRequired',
        });
        const addressNotRecognizedMessage = intl.formatMessage({
          id: 'EditListingLocationForm.addressNotRecognized',
        });

        const {
          bookingQuestion1,
          bookingQuestion2,
          bookingQuestion3,
        } = listing?.attributes?.publicData;

        return (
          <Form onSubmit={handleSubmit} className={classes} enforcePagePreloadFor="CheckoutPage">
            {/* Removed Available Packages box as requested */}
            {PriceVariantFieldComponent ? (
              <PriceVariantFieldComponent
                priceVariants={priceVariants}
                priceVariantName={priceVariantName}
                onPriceVariantChange={onPriceVariantChange(formRenderProps)}
                onPriceVariantNamesChange={onPriceVariantNamesChange(formRenderProps)}
                formApi={form}
                disabled={!isPublishedListing}
                currency={unitPrice?.currency}
              />
            ) : null}

            {listing?.attributes?.publicData?.providerStudio_listingfield === 'yes_option' && (
              <FieldSelect
                id={`locationChoice`}
                name="locationChoice"
                className={css.field}
                label={'Location Choice'}
                // validate={validators.required(
                //   "offersInStudio Required"
                // )}
              >
                <option disabled value="">
                  Select Location
                </option>
                <option value="mylocation">At my location</option>
                <option value="providerLocation">At provider’s location</option>
              </FieldSelect>
            )}
            {(values?.locationChoice === 'mylocation' ||
              listing?.attributes?.publicData?.providerStudio_listingfield !== 'yes_option') && (
              <div className={css.field}>
                <FieldLocationAutocompleteInput
                  rootClassName={css.locationAddress}
                  inputClassName={css.locationAutocompleteInput}
                  iconClassName={css.locationAutocompleteInputIcon}
                  predictionsClassName={css.predictionsRoot}
                  validClassName={css.validLocation}
                  autoFocus={false}
                  name="location"
                  label={intl.formatMessage({ id: 'EditListingLocationForm.address' })}
                  placeholder={intl.formatMessage({
                    id: 'EditListingLocationForm.addressPlaceholder',
                  })}
                  useDefaultPredictions={false}
                  format={identity}
                  valueFromForm={values.location}
                  validate={composeValidators(
                    autocompleteSearchRequired(addressRequiredMessage),
                    autocompletePlaceSelected(addressNotRecognizedMessage)
                  )}
                  hideLocationIcon={true}
                  // CustomIcon={()=> <></>}
                />
              </div>
            )}
            {values?.locationChoice === 'providerLocation' && (
              <div className={classNames(css.field, css.providerLocation)}>
                Provider Location :{' '}
                <a
                  href={`https://www.google.com/maps?q=${listing.attributes.geolocation.lat},${listing.attributes.geolocation.lng}`}
                  target="_blank"
                >
                  {listing.attributes.publicData.location.address}
                </a>
              </div>
            )}

            {bookingQuestion1 && (
              <FieldTextInput
                id={`bookingQuestion1`}
                name="bookingQuestion1"
                className={css.field}
                type="text"
                label={bookingQuestion1}
                placeholder={'Enter answer'}
                validate={composeValidators(validators.required('Required'))}
                autoFocus={true}
              />
            )}

            {bookingQuestion2 && (
              <FieldTextInput
                id={`bookingQuestion2`}
                name="bookingQuestion2"
                className={css.field}
                type="text"
                label={bookingQuestion2}
                placeholder={'Enter answer'}
                validate={composeValidators(validators.required('Required'))}
                autoFocus={true}
              />
            )}

            {bookingQuestion3 && (
              <FieldTextInput
                id={`bookingQuestion3`}
                name="bookingQuestion3"
                className={css.field}
                type="text"
                label={bookingQuestion3}
                placeholder={'Enter answer'}
                validate={composeValidators(validators.required('Required'))}
                autoFocus={true}
              />
            )}

            {monthlyTimeSlots && timeZone ? (
              <FieldDateAndTimeInput
                seatsEnabled={seatsEnabled}
                setSeatsOptions={setSeatsOptions}
                startDateInputProps={{
                  label: intl.formatMessage({ id: 'BookingFixedDurationForm.bookingStartTitle' }),
                  placeholderText: startDatePlaceholder,
                }}
                className={css.bookingDates}
                listingId={listingId}
                startTimeInterval={startTimeInterval}
                onFetchTimeSlots={onFetchTimeSlots}
                monthlyTimeSlots={monthlyTimeSlots}
                timeSlotsForDate={timeSlotsForDate}
                minDurationStartingInInterval={minDurationStartingInInterval}
                values={values}
                priceVariants={priceVariants}
                intl={intl}
                form={form}
                pristine={pristine}
                disabled={isPriceVariationsInUse && !priceVariantName}
                timeZone={timeZone}
                dayCountAvailableForBooking={dayCountAvailableForBooking}
                handleFetchLineItems={onHandleFetchLineItems}
                listing={listing}
              />
            ) : null}
            {seatsEnabled ? (
              <FieldSelect
                name="seats"
                id="seats"
                disabled={!startTime}
                showLabelAsDisabled={!startTime}
                label={intl.formatMessage({ id: 'BookingFixedDurationForm.seatsTitle' })}
                className={css.fieldSeats}
                onChange={values => {
                  onHandleFetchLineItems({
                    values: {
                      priceVariantName,
                      priceVariantNames,
                      bookingStartTime: startTime,
                      bookingEndTime: endDate ? endDate.getTime() : null,
                      seats: values,
                    },
                  });
                }}
              >
                <option disabled value="">
                  {intl.formatMessage({ id: 'BookingFixedDurationForm.seatsPlaceholder' })}
                </option>
                {seatsOptions.map(s => (
                  <option value={s} key={s}>
                    {s}
                  </option>
                ))}
              </FieldSelect>
            ) : null}

            {startTime && endDate && !isOwnListing ? (
              <CouponCodeField
                className={css.field}
                listingId={rest.listingId}
                orderData={values}
                onCouponApplied={handleCouponApplied}
                onCouponRemoved={handleCouponRemoved}
                appliedCoupon={appliedCoupon}
                disabled={fetchLineItemsInProgress}
              />
            ) : null}

            {appliedCoupon?.code && (
              <FieldTextInput
                id={`coupanCode`}
                name="coupanCode"
                className={css.field}
                type="hidden"
                value={appliedCoupon?.code}
                defaultValue={appliedCoupon?.code}
              />
            )}
            {showEstimatedBreakdown ? (
              <div className={css.priceBreakdownContainer}>
                <H6 as="h3" className={css.bookingBreakdownTitle}>
                  <FormattedMessage id="BookingFixedDurationForm.priceBreakdownTitle" />
                </H6>
                <hr className={css.totalDivider} />
                <EstimatedCustomerBreakdownMaybe
                  listing={listing}
                  breakdownData={breakdownData}
                  lineItems={lineItems}
                  timeZone={timeZone}
                  currency={unitPrice.currency}
                  marketplaceName={marketplaceName}
                  processName={BOOKING_PROCESS_NAME}
                />
              </div>
            ) : null}

            <FetchLineItemsError error={fetchLineItemsError} />

            <div className={css.submitButton}>
              <PrimaryButton
                type="submit"
                inProgress={fetchLineItemsInProgress}
                disabled={submitDisabled}
              >
                <FormattedMessage id="BookingFixedDurationForm.requestToBook" />
              </PrimaryButton>
            </div>

            <p className={css.finePrint}>
              {payoutDetailsWarning ? (
                payoutDetailsWarning
              ) : (
                <FormattedMessage
                  id={
                    isOwnListing
                      ? 'BookingFixedDurationForm.ownListing'
                      : 'BookingFixedDurationForm.youWontBeChargedInfo'
                  }
                />
              )}
            </p>
          </Form>
        );
      }}
    />
  );
};

export default BookingFixedDurationForm;
