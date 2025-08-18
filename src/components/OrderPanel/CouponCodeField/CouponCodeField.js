import React, { useState } from 'react';
import { bool, func, string, object } from 'prop-types';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { FieldTextInput, Button, IconCheckmark, IconClose } from '../../../components';
import { applyCoupon, validateCoupon } from '../../../util/api';

import css from './CouponCodeField.module.css';

const CouponCodeField = props => {
  const {
    className,
    rootClassName,
    name = 'couponCode',
    onCouponApplied,
    onCouponRemoved,
    appliedCoupon,
    listingId,
    orderData,
    disabled = false,
  } = props;

  const intl = useIntl();
  const [couponCode, setCouponCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const classes = classNames(rootClassName || css.root, className);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setValidationError(intl.formatMessage({ id: 'CouponCodeField.emptyCode' }));
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      // Calculate the order total from orderData if available
      // Make sure orderTotal is a number and not zero
      let orderTotal = 0;
      if (orderData?.total?.amount) {
        orderTotal = parseInt(orderData.total.amount, 10);
      } else if (orderData?.lineItems) {
        // Try to calculate from line items
        orderTotal = orderData.lineItems.reduce((total, item) => {
          return total + (item.lineTotal?.amount || 0);
        }, 0);
      }

      const currency = orderData?.total?.currency || 'USD';
      
      // Validate coupon first
      const validationResponse = await validateCoupon({
        code: couponCode.trim().toUpperCase(),
        couponCode: couponCode.trim().toUpperCase(), // Send both parameter names to be safe
        listingId,
        orderTotal,
        currency,
      });

      if (validationResponse && validationResponse.success) {
        // Apply the coupon
        const applyResponse = await applyCoupon({
          code: couponCode.trim().toUpperCase(),
          couponCode: couponCode.trim().toUpperCase(), // Send both parameter names to be safe
          listingId,
          orderTotal,
          currency,
        });
        console.log('applyResponse>>>>>>>>>>>>>',applyResponse)

        if (applyResponse && applyResponse.success) {
          onCouponApplied({
            code: couponCode.trim().toUpperCase(),
            discount: applyResponse.data?.coupon?.amount || 0,
            type: applyResponse.data?.coupon?.type || 'fixed',
          });
          setCouponCode('');
        } else {
          setValidationError(applyResponse?.error || intl.formatMessage({ id: 'CouponCodeField.applyError' }));
        }
      } else {
        // Handle specific error cases
        if (validationResponse?.error && validationResponse.error.includes('Missing required fields')) {
          setValidationError(intl.formatMessage({ id: 'CouponCodeField.missingFields' }));
        } else {
          setValidationError(validationResponse?.error || intl.formatMessage({ id: 'CouponCodeField.invalidCode' }));
        }
      }
    } catch (error) {
      
      // Display the actual error message from the backend if available
      if (error.error) {
        // Use the error message directly from the backend
        setValidationError(error.error);
      } else if (error.status === 404) {
        // 404 status typically means invalid coupon
        setValidationError(intl.formatMessage({ id: 'CouponCodeField.invalidCode' }));
      } else if (error.message && (
        error.message.includes('coupon') || 
        error.message.includes('invalid') || 
        error.message.includes('expired')
      )) {
        // Use the error message if it contains relevant keywords
        setValidationError(error.message);
      } else {
        // Fallback to generic network error
        setValidationError(intl.formatMessage({ id: 'CouponCodeField.networkError' }));
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    onCouponRemoved();
    setValidationError(null);
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleApplyCoupon();
    }
  };
  if (appliedCoupon) {
    return (
      <div className={classes}>
        <div className={css.appliedCoupon}>
          <div className={css.appliedCouponInfo}>
            <IconCheckmark className={css.successIcon} />
            <span className={css.appliedCouponCode}>
              <FormattedMessage 
                id="CouponCodeField.appliedCoupon" 
                values={{ code: appliedCoupon.code }}
              />
            </span>
            <span className={css.discountAmount}>
              {appliedCoupon.type === 'percentage' 
                ? `${appliedCoupon.discount}%`
                : `$${(appliedCoupon.discount / 100).toFixed(2)}`
              }
            </span>
          </div>
          <Button
            type="button"
            onClick={handleRemoveCoupon}
            className={css.removeButton}
            disabled={disabled}
          >
            <IconClose className={css.removeIcon} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes}>
      <div className={css.couponContainer}>
        <div className={css.couponLabel}>
          <FormattedMessage id="CouponCodeField.label" />
        </div>
        <div className={css.couponInputContainer}>
          <input
            id={name}
            name={name}
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={intl.formatMessage({ id: 'CouponCodeField.placeholder' })}
            className={css.couponInput}
            disabled={disabled || isValidating}
            autoComplete="off"
            data-testid="coupon-code-input"
          />
          </div>
          <div className={css.couponInputContainer}>

          <Button
            type="button"
            onClick={handleApplyCoupon}
            className={css.applyButton}
            disabled={disabled || isValidating || !couponCode.trim()}
            inProgress={isValidating}
          >
            <FormattedMessage id="CouponCodeField.apply" />
          </Button>
        </div>
      </div>
      
      {validationError && (
        <div className={css.error}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11v6h2v-6h-2zm0-4v2h2V7h-2z" fill="currentColor"/>
          </svg>
          {validationError}
        </div>
      )}
      
      <div className={css.helpText}>
        <FormattedMessage id="CouponCodeField.helpText" />
      </div>
    </div>
  );
};

CouponCodeField.propTypes = {
  className: string,
  rootClassName: string,
  name: string,
  onCouponApplied: func.isRequired,
  onCouponRemoved: func.isRequired,
  appliedCoupon: object,
  listingId: string.isRequired,
  orderData: object.isRequired,
  disabled: bool,
};

export default CouponCodeField;
