import React, { useState, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import moment from 'moment-timezone';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { FieldSingleDatePicker, FieldSelect, H6 } from '../../../components';
import { bookingDateRequired } from '../../../util/validators';
import { getStartOf, monthIdString, addTime, bookingTimeUnits, findNextBoundary, stringifyDateToISO8601, timeOfDayFromLocalToTimeZone, getBoundaries, isDateSameOrAfter } from '../../../util/dates';
import { timeSlotsPerDate } from '../../../util/generators';
import { getMonthlyFetchRange, getAllTimeSlots, getTimeSlotsOnDate, isToday } from '../../../components/OrderPanel/booking.shared';

import css from './RescheduleBookingModal.module.css';

/**
 * Date/time picker for reschedule modal with real availability fetching
 * Uses the same format as the original booking form (timestamps)
 */
const SimpleReschedulePicker = props => {
  const {
    timeZone,
    listingId,
    monthlyTimeSlots,
    timeSlotsForDate,
    onFetchTimeSlots,
    bookingLengthInMinutes,
    startTimeInterval = 'hour',
  } = props;
  
  const intl = useIntl();
  const [selectedDate, setSelectedDate] = useState(null);
  const hasFetchedRef = useRef({});
  const hasFetchedPerDateRef = useRef({});

  const TODAY = new Date();

  const pickerTimeSlots = getAllTimeSlots(monthlyTimeSlots, false);
  const [startMonth, endMonth] = getMonthlyFetchRange(monthlyTimeSlots, timeZone);
  const options = { minDurationStartingInDay: bookingLengthInMinutes };
  
  const monthlyTimeSlotsData = timeSlotsPerDate(
    startMonth,
    endMonth,
    pickerTimeSlots,
    timeZone,
    options
  );

  useEffect(() => {
    if (!listingId || !timeZone || !onFetchTimeSlots || !bookingLengthInMinutes) return;

    const fetchKey = `${listingId.uuid}-${bookingLengthInMinutes}`;
    if (hasFetchedRef.current[fetchKey]) return;

    const now = new Date();
    const startOfToday = getStartOf(now, 'day', timeZone);
    const timeUnit = startTimeInterval
      ? bookingTimeUnits[startTimeInterval]?.timeUnit
      : 'hour';
    const nextBoundary = findNextBoundary(now, 1, timeUnit, timeZone);

    const nextMonth = getStartOf(nextBoundary, 'month', timeZone, 1, 'months');
    const nextAfterNextMonth = getStartOf(nextMonth, 'month', timeZone, 1, 'months');

    const nextMonthEnd = getStartOf(nextMonth, 'minute', timeZone, bookingLengthInMinutes, 'minutes');
    const followingMonthEnd = getStartOf(nextAfterNextMonth, 'minute', timeZone, bookingLengthInMinutes, 'minutes');

    const minDurationStartingInInterval = bookingLengthInMinutes;

    const options = intervalAlign => {
      return {
        extraQueryParams: {
          intervalDuration: 'P1D',
          intervalAlign,
          maxPerInterval: 1,
          minDurationStartingInInterval,
          perPage: 31,
          page: 1,
        },
      };
    };

    // Fetch 2 months just like listing page
    Promise.all([
      onFetchTimeSlots(listingId.uuid, nextBoundary, nextMonthEnd, timeZone, options(startOfToday)),
      onFetchTimeSlots(listingId.uuid, nextMonth, followingMonthEnd, timeZone, options(nextMonth)),
    ]);
    
    hasFetchedRef.current[fetchKey] = true;
  }, [listingId?.uuid, timeZone, bookingLengthInMinutes, startTimeInterval, onFetchTimeSlots]);

  useEffect(() => {
    if (!selectedDate || !listingId || !timeZone || !onFetchTimeSlots) return;

    const dayInListingTZ = timeOfDayFromLocalToTimeZone(selectedDate, timeZone);
    const dateIdString = stringifyDateToISO8601(dayInListingTZ, timeZone);
    
    if (hasFetchedPerDateRef.current[dateIdString]) return;

    hasFetchedPerDateRef.current[dateIdString] = true;

    const startDate = getStartOf(dayInListingTZ, 'day', timeZone);
    const nextDay = getStartOf(startDate, 'day', timeZone, 1, 'days');
    
    const timeUnit = bookingTimeUnits[startTimeInterval]?.timeUnit || 'hour';
    const nextBoundaryToday = findNextBoundary(new Date(), 1, timeUnit, timeZone);
    const nextBoundary = isToday(startDate, timeZone)
      ? nextBoundaryToday
      : findNextBoundary(startDate, 1, timeUnit, timeZone);
    const startLimit = isDateSameOrAfter(startDate, nextBoundaryToday) ? startDate : nextBoundary;
    const endLimit = getStartOf(nextDay, 'minute', timeZone, bookingLengthInMinutes, 'minutes');

    onFetchTimeSlots(listingId.uuid, startLimit, endLimit, timeZone, {
      useFetchTimeSlotsForDate: true,
    });
  }, [selectedDate, listingId, timeZone, bookingLengthInMinutes, startTimeInterval, onFetchTimeSlots]);

  const availableTimeSlots = useMemo(() => {
    if (!selectedDate || !timeZone || !bookingLengthInMinutes) return [];

    const dayInListingTZ = timeOfDayFromLocalToTimeZone(selectedDate, timeZone);
    const dateIdString = stringifyDateToISO8601(dayInListingTZ, timeZone);
    
    const perDateData = timeSlotsForDate?.[dateIdString];
    let slotsToUse = null;
    
    if (perDateData?.timeSlots && perDateData.timeSlots.length > 0) {
      slotsToUse = perDateData.timeSlots;
    } else {
      const dayData = monthlyTimeSlotsData?.[dateIdString];
      if (dayData?.timeSlots && dayData.timeSlots.length > 0) {
        slotsToUse = dayData.timeSlots;
      }
    }

    if (!slotsToUse || slotsToUse.length === 0) return [];

    const slots = slotsToUse;

    // GENERATE individual time options from the availability slot
    // (Same logic as listing page - FieldDateAndTimeInput.js:58-121 + 437-443)
    const bookingStartDate = getStartOf(dayInListingTZ, 'day', timeZone);
    const nextDay = getStartOf(bookingStartDate, 'day', timeZone, 1, 'days');
    const timeUnitConfig = bookingTimeUnits[startTimeInterval];
    const overlapWithNextDay = !!timeUnitConfig?.timeUnitInMinutes
      ? bookingLengthInMinutes - timeUnitConfig.timeUnitInMinutes
      : bookingLengthInMinutes;
    const nextDayPlusBookingLength = getStartOf(
      nextDay,
      'minute',
      timeZone,
      overlapWithNextDay,
      'minutes'
    );

    // Enforce 24-hour advance booking constraint for reschedules
    // Customer cannot reschedule to any time within the next 24 hours
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const timeUnit = timeUnitConfig.timeUnit;
    const minStartLimit24h = findNextBoundary(twentyFourHoursFromNow, 1, timeUnit, timeZone);
    
    // Use the later of: booking start date OR 24 hours from now
    const minStartLimit = isDateSameOrAfter(bookingStartDate, minStartLimit24h) 
      ? bookingStartDate 
      : minStartLimit24h;

    const allStartTimes = slots.reduce((availableStartTimes, t) => {
      const startDate = t.attributes.start;
      const endDate = t.attributes.end;

      let startLimit = isDateSameOrAfter(bookingStartDate, startDate)
        ? bookingStartDate
        : startDate;
      
      startLimit = isDateSameOrAfter(startLimit, minStartLimit)
        ? startLimit
        : minStartLimit;

      const endOfTimeSlotOrDay = isDateSameOrAfter(endDate, nextDayPlusBookingLength)
        ? nextDayPlusBookingLength
        : endDate;
      const endLimit = getStartOf(
        endOfTimeSlotOrDay,
        'minute',
        timeZone,
        -1 * bookingLengthInMinutes,
        'minutes'
      );

      const startTimes = getBoundaries(
        startLimit,
        endLimit,
        1,
        timeUnitConfig.timeUnit,
        timeZone,
        intl
      );
      
      const pickedTimestamps = availableStartTimes.map(t => t.timestamp);
      const uniqueStartTimes = startTimes.filter(t => !pickedTimestamps.includes(t.timestamp));
      return availableStartTimes.concat(uniqueStartTimes);
    }, []);

    const options = allStartTimes.map(timeOption => {
      return { value: timeOption.timestamp, label: timeOption.timeOfDay };
    });

    return options;
  }, [selectedDate, monthlyTimeSlotsData, timeSlotsForDate, timeZone, bookingLengthInMinutes, startTimeInterval, intl]);

  // Block days based on availability AND 24-hour advance booking rule
  const isDayBlocked = (day) => {
    const dayInListingTZ = timeOfDayFromLocalToTimeZone(day, timeZone);
    const dateIdString = stringifyDateToISO8601(dayInListingTZ, timeZone);
    const timeSlotData = monthlyTimeSlotsData[dateIdString];
    
    // Block if no availability
    if (!timeSlotData?.hasAvailability) {
      return true;
    }
    
    // Block if the entire day is within the next 24 hours
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endOfDay = getStartOf(dayInListingTZ, 'day', timeZone, 1, 'days');
    
    // If the end of this day is before 24h from now, block it entirely
    return endOfDay <= twentyFourHoursFromNow;
  };

  const isOutsideRange = (day) => {
    // Allow dates from tomorrow up to 90 days out
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    
    const checkDay = new Date(day);
    checkDay.setHours(0, 0, 0, 0);
    
    return checkDay < tomorrow || checkDay > maxDate;
  };

  const isLoading = !monthlyTimeSlots || Object.keys(monthlyTimeSlots).length === 0;

  return (
    <div className={css.dateTimePicker}>
      <H6 as="h3" className={css.fieldLabel}>
        <FormattedMessage id="RescheduleBookingModal.selectNewDate" />
      </H6>
      
      <FieldSingleDatePicker
        name="bookingStartDate"
        id="rescheduleBookingStartDate"
        label={intl.formatMessage({ id: 'RescheduleBookingModal.dateLabel' })}
        placeholderText={intl.formatDate(TODAY, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
        useMobileMargins
        validate={bookingDateRequired(intl.formatMessage({ id: 'RescheduleBookingModal.dateRequired' }))}
        isDayBlocked={isDayBlocked}
        isOutsideRange={isOutsideRange}
        onChange={(value) => {
          setSelectedDate(value?.date);
        }}
      />

      {isLoading && (
        <p className={css.loadingText}>
          <FormattedMessage id="RescheduleBookingModal.loadingAvailability" />
        </p>
      )}

      {selectedDate && !isLoading && (
        <FieldSelect
          name="bookingStartTime"
          id="rescheduleBookingStartTime"
          label={intl.formatMessage({ id: 'RescheduleBookingModal.timeLabel' })}
          className={css.fieldSelect}
          validate={value => (!value ? intl.formatMessage({ id: 'RescheduleBookingModal.timeRequired' }) : undefined)}
        >
          <option value="">
            {intl.formatMessage({ id: 'RescheduleBookingModal.selectTime' })}
          </option>
          {availableTimeSlots.length > 0 ? (
            availableTimeSlots.map(slot => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))
          ) : (
            <option disabled>
              {intl.formatMessage({ id: 'RescheduleBookingModal.noAvailableTimes' })}
            </option>
          )}
        </FieldSelect>
      )}
    </div>
  );
};

SimpleReschedulePicker.propTypes = {
  timeZone: PropTypes.string,
  listingId: PropTypes.object,
  monthlyTimeSlots: PropTypes.object,
  timeSlotsForDate: PropTypes.object,
  onFetchTimeSlots: PropTypes.func,
  bookingLengthInMinutes: PropTypes.number,
  startTimeInterval: PropTypes.string,
};

export default SimpleReschedulePicker;

