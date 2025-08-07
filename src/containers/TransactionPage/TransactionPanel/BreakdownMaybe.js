import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { H6 } from '../../../components';

import css from './TransactionPanel.module.css';

// Functional component as a helper to build OrderBreakdown
const BreakdownMaybe = props => {
  const { className, rootClassName, orderBreakdown, processName, priceVariantName,transaction } = props;
  const classes = classNames(rootClassName || css.breakdownMaybe, className);
console.log('transaction',transaction?.attributes?.metadata?.selectedLocation)
  return orderBreakdown ? (
    <div className={classes}>
      {priceVariantName ? (
        <div className={css.bookingPriceVariant}>
          <p>{priceVariantName}</p>
        </div>
      ) : null}
      <div className={css.orderBreakdownTitle}><b>Location:</b> {transaction?.attributes?.metadata?.selectedLocation}</div>

      <H6 as="h3" className={css.orderBreakdownTitle}>
        <FormattedMessage id={`TransactionPanel.${processName}.orderBreakdownTitle`} />
      </H6>
      <hr className={css.totalDivider} />
      
      {orderBreakdown}
    </div>
  ) : null;
};

export default BreakdownMaybe;
