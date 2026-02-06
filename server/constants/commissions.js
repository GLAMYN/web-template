/**
 * Commission rates for recurring customers and providers
 */
exports.recurringCommission = {
  providerCommission: {
    percentage: 5,
    minimum_amount: 0, // $5.00 in cents (subunits)
  },
  customerCommission: {
    percentage: 0,
    minimum_amount: 0,
  },
};
