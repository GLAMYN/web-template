import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { H6 } from '../../../components';

import css from './TransactionPanel.module.css';

// Functional component as a helper to build OrderBreakdown
const BreakdownMaybe = props => {
  const { className, rootClassName, orderBreakdown, processName, priceVariantName,transaction,listing } = props;
  const classes = classNames(rootClassName || css.breakdownMaybe, className);

const locationUrl = transaction?.attributes?.metadata?.selectedLocationType === "providerLocation" ? `https://www.google.com/maps?q=${listing?.attributes?.geolocation?.lat},${listing?.attributes?.geolocation?.lng}` : `https://www.google.com/maps?q=${transaction?.attributes?.metadata?.location?.selectedPlace?.origin?.lat},${transaction?.attributes?.metadata?.location?.selectedPlace?.origin?.lng}`
  return orderBreakdown ? (
    <div className={classes}>
      {priceVariantName ? (
        <div className={css.bookingPriceVariant}>
          <p>{priceVariantName}</p>
        </div>
      ) : null}
      <div className={css.orderBreakdownTitle}><b>Location:</b> <a href={locationUrl}>{transaction?.attributes?.metadata?.selectedLocationType === "providerLocation" ? listing?.attributes?.publicData?.location?.address : transaction?.attributes?.metadata?.location?.selectedPlace?.address}</a></div>
      {transaction?.attributes?.metadata?.bookingQuestion1 && <div className={css.orderBreakdownTitle}><b>{listing?.attributes?.publicData?.bookingQuestion1}:</b> {transaction?.attributes?.metadata?.bookingQuestion1}</div>}
      {transaction?.attributes?.metadata?.bookingQuestion2 && <div className={css.orderBreakdownTitle}><b>{listing?.attributes?.publicData?.bookingQuestion2}:</b> {transaction?.attributes?.metadata?.bookingQuestion2}</div>}
      {transaction?.attributes?.metadata?.bookingQuestion3 && <div className={css.orderBreakdownTitle}><b>{listing?.attributes?.publicData?.bookingQuestion2}:</b> {transaction?.attributes?.metadata?.bookingQuestion1}</div>}


      <H6 as="h3" className={css.orderBreakdownTitle}>
        <FormattedMessage id={`TransactionPanel.${processName}.orderBreakdownTitle`} />
      </H6>
      <hr className={css.totalDivider} />
      
      {orderBreakdown}
    </div>
  ) : null;
};

export default BreakdownMaybe;
