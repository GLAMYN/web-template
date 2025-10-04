import React, { useState } from 'react';
import { Form as FinalForm } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import classNames from 'classnames';
import moment from 'moment';

import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { Button, FieldCheckboxGroup, FieldTextInput, FieldRadioButton } from '../../components';

import css from './InboxFilter.module.css';


const QUICK_FILTER_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
];


const BOOKING_STATUS_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'cancelled', label: 'Cancelled' },

];


const READ_STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
];

const InboxFilterComponent = props => {
  const intl = useIntl();
  const {
    className,
    rootClassName,
    isOpen = false,
    history,
    location,
  } = props;

  const [quickFilter, setQuickFilter] = useState(null);


  const getCurrentFilterValues = () => {
    const searchParams = new URLSearchParams(location.search);
    const currentFilters = {};
    

    const bookingStates = searchParams.get('bookingStates');
    if (bookingStates) {
      currentFilters.bookingStates = bookingStates.split(',');
    }
    

    const metaUnread = searchParams.get('meta_unread');
    if (metaUnread !== null) {
      if (metaUnread === 'true') {
        currentFilters.readStatus = 'unread';
      } else if (metaUnread === 'false') {
        currentFilters.readStatus = 'read';
      }
    } else {
      currentFilters.readStatus = 'all';
    }
    

    const bookingStart = searchParams.get('bookingStart');
    const bookingEnd = searchParams.get('bookingEnd');
    if (bookingStart) {
      currentFilters.bookingStartDate = moment(bookingStart).format('YYYY-MM-DD');
    }
    if (bookingEnd) {
      currentFilters.bookingEndDate = moment(bookingEnd).format('YYYY-MM-DD');
    }
    
    return currentFilters;
  };


  const handleApplyFilters = (filterValues) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete('bookingStart');
    searchParams.delete('bookingEnd');
    searchParams.delete('bookingStates');
    searchParams.delete('meta_unread');
    searchParams.delete('page'); // Reset to first page when filtering
    if (filterValues.bookingStart) {
      searchParams.set('bookingStart', filterValues.bookingStart);
    }
    if (filterValues.bookingEnd) {
      searchParams.set('bookingEnd', filterValues.bookingEnd);
    }
    if (filterValues.bookingStates && filterValues.bookingStates.length > 0) {
      searchParams.set('bookingStates', filterValues.bookingStates.join(','));
    }
    if (filterValues.meta_unread !== undefined) {
      searchParams.set('meta_unread', filterValues.meta_unread);
    }
    const newSearch = searchParams.toString();
    history.push(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  };
  const handleClearFilters = () => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete('bookingStart');
    searchParams.delete('bookingEnd');
    searchParams.delete('bookingStates');
    searchParams.delete('meta_unread');
    searchParams.delete('page');
    const newSearch = searchParams.toString();
    history.push(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  };

  const classes = classNames(rootClassName || css.root, className);
  const filterClasses = classNames(css.filterPanel, {
    [css.filterPanelOpen]: isOpen,
  });

  const handleQuickFilter = (filterType) => {

    if (quickFilter === filterType) {
      setQuickFilter(null);
      return;
    }
    

    setQuickFilter(filterType);
  };

  const handleFormSubmit = (values) => {
    const filterValues = {
      ...values,
    };
     const { timeZone } = Intl.DateTimeFormat().resolvedOptions(); 

    if (quickFilter) {
    
      const today = moment().tz(timeZone).startOf('day');
      const tomorrow = moment().tz(timeZone).add(1, 'day').startOf('day');
      
      if (quickFilter === 'today') {
        filterValues.bookingStart = today.toISOString();
        filterValues.bookingEnd = today.endOf('day').toISOString();
      } else if (quickFilter === 'tomorrow') {
        filterValues.bookingStart = tomorrow.toISOString();
        filterValues.bookingEnd = tomorrow.endOf('day').toISOString();
      }
    } else {
      if (values.bookingStartDate) {
        filterValues.bookingStart = moment(values.bookingStartDate).tz(timeZone).startOf('day').toISOString();
      }
      if (values.bookingEndDate) {
        filterValues.bookingEnd = moment(values.bookingEndDate).tz(timeZone).endOf('day').toISOString();
      }
    }
    

    if (values.readStatus) {
      if (values.readStatus === 'all') {
        delete filterValues.meta_unread;
      } else if (values.readStatus === 'unread') {
        filterValues.meta_unread = true;
      } else if (values.readStatus === 'read') {
        filterValues.meta_unread = false;
      }
    }
    handleApplyFilters(filterValues);
  };

  const handleClearAll = () => {
    setQuickFilter(null);
    handleClearFilters();
  };

  return (
    <div className={classes}>
      {/* Quick Filters */}
      <div className={css.quickFilters}>
        <h3 className={css.sectionTitle}>
          <FormattedMessage id="InboxFilter.quickFilters" />
        </h3>
        <div className={css.chipContainer}>
          {QUICK_FILTER_OPTIONS.map(option => (
            <button
              key={option.key}
              type="button"
              className={classNames(css.chip, {
                [css.chipActive]: quickFilter === option.key,
              })}
              onClick={() => handleQuickFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Panel */}
      <div className={filterClasses}>
        <FinalForm
          onSubmit={handleFormSubmit}
          initialValues={getCurrentFilterValues()}
          mutators={{
            ...arrayMutators,
          }}
          render={({ handleSubmit, form, values }) => (
            <form onSubmit={handleSubmit} className={css.filterForm}>
              {/* Status Filter */}
              <div className={css.filterSection}>
                <h3 className={css.sectionTitle}>
                  <FormattedMessage id="InboxFilter.status" />
                </h3>
                <FieldCheckboxGroup
                  id="bookingStatus"
                  name="bookingStates"
                  options={BOOKING_STATUS_OPTIONS}
                  className={css.checkboxGroup}
                />
              </div>

              {/* Read/Unread Filter */}
              <div className={css.filterSection}>
                <h3 className={css.sectionTitle}>
                  <FormattedMessage id="InboxFilter.readStatus" />
                </h3>
                <div className={css.radioGroup}>
                  {READ_STATUS_OPTIONS.map(option => (
                    <FieldRadioButton
                      key={option.key}
                      id={`readStatus-${option.key}`}
                      name="readStatus"
                      label={option.label}
                      value={option.key}
                      className={css.radioButton}
                    />
                  ))}
                </div>
              </div>

              {/* Date Range Filter */}
              <div className={css.filterSection}>
                <h3 className={css.sectionTitle}>
                  <FormattedMessage id="InboxFilter.dateRange" />
                  {quickFilter && (
                    <span className={css.disabledNote}>
                      <FormattedMessage id="InboxFilter.disabledByQuickFilter" />
                    </span>
                  )}
                </h3>
                <div className={css.dateInputsInline}>
                  <FieldTextInput
                    id="bookingStartDate"
                    name="bookingStartDate"
                    type="date"
                    label={intl.formatMessage({ id: 'InboxFilter.startDate' })}
                    className={classNames(css.dateInput, {
                      [css.dateInputDisabled]: !!quickFilter,
                    })}
                    disabled={!!quickFilter}
                  />
                  <FieldTextInput
                    id="bookingEndDate"
                    name="bookingEndDate"
                    type="date"
                    label={intl.formatMessage({ id: 'InboxFilter.endDate' })}
                    className={classNames(css.dateInput, {
                      [css.dateInputDisabled]: !!quickFilter,
                    })}
                    disabled={!!quickFilter}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className={css.actionButtons}>
                <Button
                  type="button"
                  onClick={handleClearAll}
                  className={css.clearButton}
                >
                  <FormattedMessage id="InboxFilter.clearAll" />
                </Button>
                <Button
                  type="submit"
                  className={css.applyButton}
                >
                  <FormattedMessage id="InboxFilter.apply" />
                </Button>
              </div>
            </form>
          )}
        />
      </div>
    </div>
  );
};

export default InboxFilterComponent;
