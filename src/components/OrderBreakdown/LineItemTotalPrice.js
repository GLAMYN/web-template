import React from 'react';
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { LINE_ITEM_PIP_BALANCE_ADJUSTMENT, propTypes } from '../../util/types';
import { resolveLatestProcessName, getProcess } from '../../transactions/transaction';

import css from './OrderBreakdown.module.css';

import Decimal from 'decimal.js';
import { types as sdkTypes } from '../../util/sdkLoader';

const { Money } = sdkTypes;

/**
 * A component that renders the total price as a line item.
 *
 * @component
 * @param {Object} props
 * @param {propTypes.transaction} props.transaction - The transaction to render
 * @param {boolean} props.isProvider - Whether the provider is the one receiving the commission
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const LineItemTotalPrice = props => {
  const { transaction, isProvider, intl } = props;
  const processName = resolveLatestProcessName(transaction?.attributes?.processName);
  if (!processName) {
    return null;
  }
  const process = getProcess(processName);
  const isCompleted = process.isCompleted(transaction?.attributes?.lastTransition);
  const isRefunded = process.isRefunded(transaction?.attributes?.lastTransition);

  let providerTotalMessageId = 'OrderBreakdown.providerTotalDefault';
  if (isCompleted) {
    providerTotalMessageId = 'OrderBreakdown.providerTotalReceived';
  } else if (isRefunded) {
    providerTotalMessageId = 'OrderBreakdown.providerTotalRefunded';
  }

  const pipItem = transaction.attributes.lineItems?.find(
    item => item.code === LINE_ITEM_PIP_BALANCE_ADJUSTMENT && !item.reversal
  );
  const isPip = !!pipItem;

  const totalLabel = isPip ? (
    isProvider ? (
      <FormattedMessage id="OrderBreakdown.totalPipProvider" />
    ) : (
      <FormattedMessage id="OrderBreakdown.totalPipCustomer" />
    )
  ) : isProvider ? (
    <FormattedMessage id={providerTotalMessageId} />
  ) : (
    <FormattedMessage id="OrderBreakdown.total" />
  );

  let totalPrice = isProvider
    ? transaction.attributes.payoutTotal
    : transaction.attributes.payinTotal;

  if (isProvider && isPip && pipItem) {
    // For PIP providers, the payoutTotal only includes the online portion.
    // We add the absolute value of the cash balance adjustment to show the full earnings (Online Payout + Cash).
    const payoutAmount = new Decimal(totalPrice.amount);
    const cashAmount = new Decimal(pipItem.lineTotal.amount).abs();
    totalPrice = new Money(payoutAmount.plus(cashAmount), totalPrice.currency);
  }

  const formattedTotalPrice = formatMoney(intl, totalPrice);

  return (
    <>
      <hr className={css.totalDivider} />
      <div className={css.lineItemTotal}>
        <div className={css.totalLabel}>{totalLabel}</div>
        <div className={css.totalPrice}>{formattedTotalPrice}</div>
      </div>
    </>
  );
};

export default LineItemTotalPrice;
