import React from 'react';

import { Heading } from '../../components';
import css from './CheckoutPage.module.css';

const MobileOrderBreakdown = props => {
  const { breakdown, speculateTransactionErrorMessage, priceVariantName,priceVariantNames } = props;

  return (
    <div className={css.priceBreakdownContainer}>
      {
        priceVariantNames?.length > 1 ? (
          <div className={css.bookingPriceVariantMobile}>
          <Heading as="h3" rootClassName={css.priceVariantNameMobile}>
            Multiple Packages
          </Heading>
        </div>
        ) :
      priceVariantName ? (
        <div className={css.bookingPriceVariantMobile}>
          <Heading as="h3" rootClassName={css.priceVariantNameMobile}>
            {priceVariantName}
          </Heading>
        </div>
      ) : null}
      {speculateTransactionErrorMessage}
      {breakdown}
    </div>
  );
};

export default MobileOrderBreakdown;
