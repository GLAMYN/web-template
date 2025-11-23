import React, { useEffect, useState } from 'react';
import { intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { humanizeLineItemCode } from '../../util/data';
import { LINE_ITEMS, propTypes } from '../../util/types';
import { types as sdkTypes } from '../../util/sdkLoader';

import css from './OrderBreakdown.module.css';
import classNames from 'classnames';

/**
 * Renders non-reversal line items that are not listed in the
 * `LINE_ITEMS` array in util/types.js
 *
 * The line items are rendered so that the line item code is formatted to human
 * readable form and the line total is printed as price.
 *
 * If you require another kind of presentation for your line items, add them to
 * the `LINE_ITEMS` array in util/types.js and create a specific line item
 * component for them that can be used in the `OrderBreakdown` component.
 *
 * @component
 * @param {Object} props
 * @param {Array<propTypes.lineItem>} props.lineItems - The line items to render
 * @param {boolean} props.isProvider - Whether the provider is the one receiving the commission
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const LineItemUnknownItemsMaybe = props => {
  const { lineItems, isProvider, intl } = props;
  const [filteredItems, setFilteredItems] = useState([]);
  const [salesItems, setSalesItems] = useState();
  const { Money, UUID } = sdkTypes;

  useEffect(() => {
    if (allItems?.length > 0) {
      const saleItem = allItems?.find(item => item.code.includes('Sales Tax'));
      const removedSaleItem = allItems?.filter(item => !item.code.includes('Sales Tax'));
      setSalesItems(saleItem);
      setFilteredItems([...removedSaleItem]);
    }
  }, [lineItems]);

  // resolve unknown non-reversal line items
  const allItems = lineItems.filter(item => LINE_ITEMS.indexOf(item.code) === -1 && !item.reversal);

  const items = isProvider
    ? filteredItems.filter(item => item.includeFor.includes('provider'))
    : filteredItems.filter(item => item.includeFor.includes('customer'));

  const serviceSubtotal = new Money(
    items.reduce((total, item) => total + item.lineTotal?.amount, 0),
    items[0]?.lineTotal?.currency
  );

  return items.length > 0 ? (
    <React.Fragment>
      {items.map((item, i) => {
        const quantity = item.quantity;

        const label =
          quantity && quantity > 1
            ? `${humanizeLineItemCode(item.code)} x ${quantity}`
            : humanizeLineItemCode(item.code);

        const formattedTotal = formatMoney(intl, item.lineTotal);
        return (
          <div key={`${i}-item.code`} className={css.lineItem}>
            <span className={css.itemLabel}>{label}</span>
            <span className={css.itemValue}>{formattedTotal}</span>
          </div>
        );
      })}

      <hr className={css.totalDivider} />
      <div className={css.lineItem}>
        <span className={classNames(css.itemLabel)}>Service subtotal</span>
        <span className={css.itemValue}>{formatMoney(intl, serviceSubtotal)}</span>
      </div>

      {salesItems && (
        <>
          <hr className={css.totalDivider} />
          <div className={css.lineItem}>
            <span className={classNames(css.itemLabel, css.salesTax)}>
              {humanizeLineItemCode(salesItems.code)}
            </span>
            <span className={css.itemValue}>{formatMoney(intl, salesItems.lineTotal)}</span>
          </div>
        </>
      )}
    </React.Fragment>
  ) : null;
};

export default LineItemUnknownItemsMaybe;
