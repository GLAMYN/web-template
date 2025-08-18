import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { types as sdkTypes } from '../../util/sdkLoader';

import css from './OrderBreakdown.module.css';

const { Money } = sdkTypes;

/**
 * A component that renders coupon discount as a line item.
 *
 * @component
 * @param {Object} props
 * @param {Array} props.lineItems - Array of line items
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element|null}
 */
const LineItemCouponDiscount = props => {
  const { lineItems, intl } = props;

  // Find coupon discount line items and combine them if there are multiple
  const couponLineItems = lineItems.filter(item => item.code === 'line-item/coupon-discount' && !item.reversal);
  
  // Don't render if no coupon discount found
  if (couponLineItems.length === 0) {
    return null;
  }
  
  // If we have multiple coupon line items, we need to combine them into one for display
  let totalDiscountAmount = 0;
  
  // Sum up all coupon discounts
  couponLineItems.forEach(item => {
    totalDiscountAmount += item.lineTotal?.amount || 0;
  });
  
  // Use the first coupon's currency
  const currency = couponLineItems[0]?.lineTotal?.currency || 'USD';
  
  // Create a combined coupon line item
  const combinedCoupon = {
    lineTotal: new Money(totalDiscountAmount, currency)
  };

  const formattedDiscount = formatMoney(intl, combinedCoupon.lineTotal);

  return (
    <div className={css.lineItem}>
      <span className={css.itemLabel}>
        <FormattedMessage id="OrderBreakdown.couponDiscount" />
      </span>
      <span className={css.itemValue}>
        {formattedDiscount}
      </span>
    </div>
  );
};

LineItemCouponDiscount.propTypes = {
  lineItems: PropTypes.array.isRequired,
  intl: intlShape.isRequired,
};

export default LineItemCouponDiscount;
