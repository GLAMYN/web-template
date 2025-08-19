/**
 * Component to conditionally display the tip amount in the order breakdown.
 */
import React from 'react';
import { FormattedMessage } from '../../util/reactIntl';

import css from './OrderBreakdown.module.css';

/**
 * Show tip amount line if it exists in transaction metadata
 *
 * @param {Object} props - Component props
 * @param {Object} props.transaction - The transaction with metadata information
 * @param {boolean} props.isProvider - Boolean indicating if current user is the provider
 * @param {Object} props.intl - React Intl instance
 * @returns {React.ReactNode} React component or null if no tip
 */
const LineItemTipMaybe = props => {
  const { transaction, isProvider, intl } = props;
  
  const tipAmount = transaction?.attributes?.metadata?.tipAmount;
  if (!tipAmount) {
    return null;
  }

  // Format the amount with currency
  let formattedTipAmount = intl.formatNumber(Number(tipAmount), {
    style: 'currency',
    currency: transaction.attributes.protectedData?.currency || 'USD',
  });
  
  // Remove the "US" prefix if it exists
  formattedTipAmount = formattedTipAmount.replace('US$', '$');

  return (
    <div className={css.lineItem}>
      <span className={css.itemLabel}>
        <FormattedMessage id={isProvider ? "OrderBreakdown.tipReceived" : "OrderBreakdown.tipPaid"} />
      </span>
      <span className={css.itemValue}>{formattedTipAmount}</span>
    </div>
  );
};

export default LineItemTipMaybe;
