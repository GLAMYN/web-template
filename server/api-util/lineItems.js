const {
  calculateQuantityFromDates,
  calculateQuantityFromHours,
  calculateShippingFee,
  getProviderCommissionMaybe,
  getCustomerCommissionMaybe,
} = require('./lineItemHelpers');
const { types } = require('sharetribe-flex-sdk');
const { Money } = types;
const salesTaxJsonData = require('./salesTax.json');
const { geocodeAddress } = require('./geocodeAddress');

/**
 * Get quantity and add extra line-items that are related to delivery method
 *
 * @param {Object} orderData should contain stockReservationQuantity and deliveryMethod
 * @param {*} publicData should contain shipping prices
 * @param {*} currency should point to the currency of listing's price.
 */
const getItemQuantityAndLineItems = (orderData, publicData, currency) => {
  // Check delivery method and shipping prices
  const quantity = orderData ? orderData.stockReservationQuantity : null;
  const deliveryMethod = orderData && orderData.deliveryMethod;
  const isShipping = deliveryMethod === 'shipping';
  const isPickup = deliveryMethod === 'pickup';
  const { shippingPriceInSubunitsOneItem, shippingPriceInSubunitsAdditionalItems } =
    publicData || {};

  // Calculate shipping fee if applicable
  const shippingFee = isShipping
    ? calculateShippingFee(
        shippingPriceInSubunitsOneItem,
        shippingPriceInSubunitsAdditionalItems,
        currency,
        quantity
      )
    : null;

  // Add line-item for given delivery method.
  // Note: by default, pickup considered as free and, therefore, we don't add pickup fee line-item
  const deliveryLineItem = !!shippingFee
    ? [
        {
          code: 'line-item/shipping-fee',
          unitPrice: shippingFee,
          quantity: 1,
          includeFor: ['customer', 'provider'],
        },
      ]
    : [];

  return { quantity, extraLineItems: deliveryLineItem };
};

/**
 * Get quantity for fixed bookings with seats.
 * @param {Object} orderData
 * @param {number} [orderData.seats]
 */
const getFixedQuantityAndLineItems = orderData => {
  const { seats } = orderData || {};
  const hasSeats = !!seats;
  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 1 session x 2 seats (aka unit price is multiplied by 2)
  return hasSeats ? { units: 1, seats, extraLineItems: [] } : { quantity: 1, extraLineItems: [] };
};

/**
 * Get quantity for arbitrary units for time-based bookings.
 *
 * @param {Object} orderData
 * @param {string} orderData.bookingStart
 * @param {string} orderData.bookingEnd
 * @param {number} [orderData.seats]
 */
const getHourQuantityAndLineItems = orderData => {
  const { bookingStart, bookingEnd, seats } = orderData || {};
  const hasSeats = !!seats;
  const units =
    bookingStart && bookingEnd ? calculateQuantityFromHours(bookingStart, bookingEnd) : null;

  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 3 hours x 2 seats (aka unit price is multiplied by 6)
  return hasSeats ? { units, seats, extraLineItems: [] } : { quantity: units, extraLineItems: [] };
};

/**
 * Calculate quantity based on days or nights between given bookingDates.
 *
 * @param {Object} orderData
 * @param {string} orderData.bookingStart
 * @param {string} orderData.bookingEnd
 * @param {number} [orderData.seats]
 * @param {'line-item/day' | 'line-item/night'} code
 */
const getDateRangeQuantityAndLineItems = (orderData, code) => {
  const { bookingStart, bookingEnd, seats } = orderData;
  const hasSeats = !!seats;
  const units =
    bookingStart && bookingEnd ? calculateQuantityFromDates(bookingStart, bookingEnd, code) : null;

  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 3 nights x 4 seats (aka unit price is multiplied by 12)
  return hasSeats ? { units, seats, extraLineItems: [] } : { quantity: units, extraLineItems: [] };
};

/**
 * Calculate coupon discount line item
 * @param {Object} coupon - The coupon object
 * @param {Array} baseLineItems - Base line items before discount
 * @param {string} currency - Currency code
 * @returns {Object|null} coupon discount line item or null
 */
const getCouponDiscountLineItem = (coupon, baseLineItems, currency) => {
  if (!coupon || !coupon.code) {
    return null;
  }

  // Calculate subtotal from base line items (customer-facing)
  const customerLineItems = baseLineItems.filter(
    item => item.includeFor.includes('customer') && !item.code.includes('commission')
  );

  const subtotal = customerLineItems.reduce((sum, item) => {
    if (item.quantity) {
      return sum + item.unitPrice.amount * item.quantity;
    } else if (item.units && item.seats) {
      return sum + item.unitPrice.amount * item.units * item.seats;
    } else if (item.percentage) {
      return sum + (item.unitPrice.amount * item.percentage) / 100;
    }
    return sum + item.unitPrice.amount;
  }, 0);

  let discountAmount = 0;

  if (coupon.type === 'percentage') {
    const percentage = Number(coupon.discount) || Number(coupon.amount) || 0;
    discountAmount = Math.round(subtotal * (percentage / 100));
  } else if (coupon.type === 'fixed') {
    const fixedAmount = Number(coupon.discount) || Number(coupon.amount) || 0;
    discountAmount = fixedAmount * 100; // Convert to cents
  }

  // Don't allow discount to exceed subtotal
  discountAmount = Math.min(discountAmount, subtotal);

  if (discountAmount <= 0) {
    return null;
  }

  return {
    code: 'line-item/coupon-discount',
    unitPrice: new Money(-discountAmount, currency),
    quantity: 1,
    includeFor: ['customer', 'provider'], // Only reduce customer's payment
  };
};

/**
 * Returns collection of lineItems (max 50)
 *
 * All the line-items dedicated to _customer_ define the "payin total".
 * Similarly, the sum of all the line-items included for _provider_ create "payout total".
 * Platform gets the commission, which is the difference between payin and payout totals.
 *
 * Each line items has following fields:
 * - `code`: string, mandatory, indentifies line item type (e.g. \"line-item/cleaning-fee\"), maximum length 64 characters.
 * - `unitPrice`: money, mandatory
 * - `lineTotal`: money
 * - `quantity`: number
 * - `percentage`: number (e.g. 15.5 for 15.5%)
 * - `seats`: number
 * - `units`: number
 * - `includeFor`: array containing strings \"customer\" or \"provider\", default [\":customer\"  \":provider\" ]
 *
 * Line item must have either `quantity` or `percentage` or both `seats` and `units`.
 *
 * `includeFor` defines commissions. Customer commission is added by defining `includeFor` array `["customer"]` and provider commission by `["provider"]`.
 *
 * @param {Object} listing
 * @param {Object} orderData
 * @param {Object} providerCommission
 * @param {Object} customerCommission
 * @returns {Array} lineItems
 */
exports.transactionLineItems = async (
  listing,
  orderData,
  providerCommission,
  customerCommission
) => {
  const publicData = listing.attributes.publicData;
  // Note: the unitType needs to be one of the following:
  // day, night, hour, fixed, or item (these are related to payment processes)
  const { unitType, priceVariants, priceVariationsEnabled } = publicData;

  const isBookable = ['day', 'night', 'hour', 'fixed'].includes(unitType);
  const priceAttribute = listing.attributes.price;
  const currency = priceAttribute.currency;

  const { priceVariantName } = orderData || {};
  const priceVariantConfig = priceVariants
    ? priceVariants.find(pv => pv.name === priceVariantName)
    : null;
  const { priceInSubunits } = priceVariantConfig || {};
  const isPriceInSubunitsValid = Number.isInteger(priceInSubunits) && priceInSubunits >= 0;

  const unitPrice =
    isBookable && priceVariationsEnabled && isPriceInSubunitsValid
      ? new Money(priceInSubunits, currency)
      : priceAttribute;

  /**
   * Pricing starts with order's base price:
   * Listing's price is related to a single unit. It needs to be multiplied by quantity
   *
   * Initial line-item needs therefore:
   * - code (based on unitType)
   * - unitPrice
   * - quantity
   * - includedFor
   */

  const code = `line-item/${unitType}`;

  // Here "extra line-items" means line-items that are tied to unit type
  // E.g. by default, "shipping-fee" is tied to 'item' aka buying products.
  const quantityAndExtraLineItems =
    unitType === 'item'
      ? getItemQuantityAndLineItems(orderData, publicData, currency)
      : unitType === 'fixed'
      ? getFixedQuantityAndLineItems(orderData)
      : unitType === 'hour'
      ? getHourQuantityAndLineItems(orderData)
      : ['day', 'night'].includes(unitType)
      ? getDateRangeQuantityAndLineItems(orderData, code)
      : {};

  const { quantity, units, seats, extraLineItems } = quantityAndExtraLineItems;

  // Throw error if there is no quantity information given
  if (!quantity && !(units && seats)) {
    const missingFields = [];

    if (!quantity) missingFields.push('quantity');
    if (!units) missingFields.push('units');
    if (!seats) missingFields.push('seats');

    const message = `Error: orderData is missing the following information: ${missingFields.join(
      ', '
    )}. Quantity or either units & seats is required.`;

    const error = new Error(message);
    error.status = 400;
    error.statusText = message;
    error.data = {};
    throw error;
  }

  /**
   * If you want to use pre-defined component and translations for printing the lineItems base price for order,
   * you should use one of the codes:
   * line-item/night, line-item/day, line-item/hour or line-item/item.
   *
   * Pre-definded commission components expects line item code to be one of the following:
   * 'line-item/provider-commission', 'line-item/customer-commission'
   *
   * By default OrderBreakdown prints line items inside LineItemUnknownItemsMaybe if the lineItem code is not recognized. */

  const quantityOrSeats = !!units && !!seats ? { units, seats } : { quantity };

  if (!orderData?.priceVariantNames || orderData?.priceVariantNames.length === 0) {
    const order = {
      code,
      unitPrice,
      ...quantityOrSeats,
      includeFor: ['customer', 'provider'],
    };
    extraLineItems.push(order);
  } else {
    orderData?.priceVariantNames?.forEach(priceVariantName => {
      const currentVariant = publicData?.priceVariants?.find(
        variant => variant.name === priceVariantName
      );
      if (currentVariant) {
        extraLineItems.push({
          code: `line-item/${priceVariantName} (${currentVariant?.bookingLengthInMinutes} minutes)`,
          unitPrice: new Money(currentVariant?.priceInSubunits, currency),
          quantity: quantityOrSeats?.quantity || quantityOrSeats?.seats || 1,
          includeFor: ['customer', 'provider'],
        });
      }
    });
  }

  // Calculate base line items before applying coupons
  const baseLineItems = [
    // order,
    ...extraLineItems,
  ];

  // Add coupon discount if present
  const coupon = orderData?.coupon;
  const couponDiscountLineItem = getCouponDiscountLineItem(coupon, baseLineItems, currency);
  const couponLineItems = couponDiscountLineItem ? [couponDiscountLineItem] : [];

  // Create line items including coupon discount for commission calculation
  const baseLineItemsWithCoupon = [
    // order,
    ...extraLineItems,
    ...couponLineItems,
  ];

  // Sales tax line item
  const salesTaxLineItem = [];
  let stateName = orderData?.location?.selectedPlace?.stateName;
  let salesTax = null;

  if (orderData?.locationChoice === 'providerLocation') {
    const address = listing?.attributes?.publicData?.location?.address;
    // Use geocoding API to extract state/province information from address
    if (address) {
      const locationMetadata = await geocodeAddress(address);
      stateName = locationMetadata?.stateName;
    }
  }
  salesTax = salesTaxJsonData.find(
    tax => tax.province.toLowerCase() === (stateName || '').toLowerCase()
  );

  if (salesTax && stateName) {
    const totalAmountBeforeTax = baseLineItemsWithCoupon.reduce(
      (sum, item) => sum + item.unitPrice.amount * item.quantity,
      0
    );
    const taxAmount = totalAmountBeforeTax * (salesTax.total_applicable_tax_rate / 100);
    salesTaxLineItem.push({
      code: `line-item/Sales Tax (${stateName})`,
      unitPrice: new Money(taxAmount, currency),
      quantity: 1,
      includeFor: ['customer', 'provider'],
    });
  }

  // Let's keep the base price (order) as first line item, then coupon discount, and provider and customer commissions as last.
  // Note: the order matters only if OrderBreakdown component doesn't recognize line-item.
  const lineItems = [
    // order,
    ...extraLineItems,
    ...salesTaxLineItem,
    ...couponLineItems,
    ...getProviderCommissionMaybe(providerCommission, baseLineItemsWithCoupon, priceAttribute),
    ...getCustomerCommissionMaybe(customerCommission, baseLineItemsWithCoupon, priceAttribute),
  ];

  return lineItems;
};
