import React from 'react';
import { bool, func, object, string } from 'prop-types';
import { compose } from 'redux';
import { Form as FinalForm } from 'react-final-form';
import { FormattedMessage, injectIntl, intlShape } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';
import { required, composeValidators } from '../../../util/validators';
import {
  Form,
  Button,
  FieldTextInput,
  FieldSelect,
  FieldCheckbox,
} from '../../../components';

import css from './CouponForm.module.css';

const DISCOUNT_TYPES = [
  { key: 'fixed', label: 'Fixed Amount' },
  { key: 'percentage', label: 'Percentage' },
];

// Removed FUNDED_BY_OPTIONS as it's no longer needed

const CURRENCIES = [
  { key: 'USD', label: 'USD - US Dollar' },
  { key: 'EUR', label: 'EUR - Euro' },
  { key: 'GBP', label: 'GBP - British Pound' },
  { key: 'CAD', label: 'CAD - Canadian Dollar' },
  { key: 'AUD', label: 'AUD - Australian Dollar' },
];

const validateCouponCode = value => {
  if (!value) return 'Coupon code is required';
  if (value.length < 3) return 'Coupon code must be at least 3 characters';
  if (value.length > 20) return 'Coupon code must be no more than 20 characters';
  if (!/^[A-Z0-9]+$/.test(value.toUpperCase())) {
    return 'Coupon code can only contain letters and numbers';
  }
  return undefined;
};

const validateAmount = (value, allValues) => {
  const numValue = Number(value);
  if (!value || isNaN(numValue) || numValue <= 0) {
    return 'Amount must be greater than 0';
  }
  // Check if allValues exists and has type property before accessing it
  if (allValues && allValues.type === 'percentage' && numValue > 100) {
    return 'Percentage cannot exceed 100%';
  }
  return undefined;
};

const validateExpirationDate = value => {
  if (value && new Date(value) <= new Date()) {
    return 'Expiration date must be in the future';
  }
  return undefined;
};

const validateMaxRedemptions = value => {
  if (value && (value < 1 || !Number.isInteger(Number(value)))) {
    return 'Max redemptions must be a positive integer';
  }
  return undefined;
};

const CouponFormComponent = props => {
  const {
    onSubmit,
    inProgress,
    formError,
    onCancel,
    initialValues,
    isEdit,
    intl,
  } = props;

  const submitInProgress = inProgress;
  const submitDisabled = submitInProgress;

  return (
    <FinalForm
      initialValues={initialValues || {
        type: 'percentage',
        currency: 'USD', // Default to USD
        isActive: true,
      }}
      onSubmit={onSubmit}
      validateOnBlur={false}
      subscription={{ 
        values: true, 
        errors: true, 
        invalid: true, 
        submitting: true 
      }} // Subscribe to form state changes
      render={({ handleSubmit, values, form, submitting, pristine, invalid }) => {
        const showCurrencyField = values.type === 'fixed';
        
        // Remove debug logging
        
        return (
          <Form onSubmit={handleSubmit} className={css.form}>
            {formError && (
              <div className={css.error}>
                <FormattedMessage id="CouponForm.submitError" />
                {formError.message && (
                  <div className={css.errorDetails}>{formError.message}</div>
                )}
              </div>
            )}

            <FieldTextInput
              id="code"
              name="code"
              type="text"
              label={intl.formatMessage({ id: 'CouponForm.codeLabel' })}
              placeholder={intl.formatMessage({ id: 'CouponForm.codePlaceholder' })}
              validate={composeValidators(required('Coupon code is required'), validateCouponCode)}
              disabled={isEdit} // Don't allow editing code
              className={css.field}
              onBlur={e => {
                // Auto-uppercase the code
                if (e.target.value) {
                  form.change('code', e.target.value.toUpperCase());
                }
              }}
            />

            <FieldSelect
              id="type"
              name="type"
              label={intl.formatMessage({ id: 'CouponForm.typeLabel' })}
              validate={required('Discount type is required')}
              className={css.field}
              onChange={(event) => {
                // When type changes to fixed, set currency to USD
                if (event.target.value === 'fixed') {
                  form.change('currency', 'USD');
                }
              }}
            >
              <option value="">
                {intl.formatMessage({ id: 'CouponForm.typeSelectPlaceholder' })}
              </option>
              {DISCOUNT_TYPES.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </FieldSelect>

            <div className={css.amountRow}>
              <FieldTextInput
                id="amount"
                name="amount"
                type="number"
                step={values.type === 'percentage' ? '1' : '0.01'}
                min={values.type === 'percentage' ? '1' : '0.01'}
                max={values.type === 'percentage' ? '100' : undefined}
                label={intl.formatMessage({ 
                  id: values.type === 'percentage' 
                    ? 'CouponForm.percentageLabel' 
                    : 'CouponForm.amountLabel' 
                })}
                placeholder={values.type === 'percentage' ? '10' : '25.00'}
                validate={composeValidators(required('Amount is required'), validateAmount)}
                className={css.field}
                inputProps={{
                  'data-testid': 'amount-input',
                  autoComplete: 'off'
                }}
              />

              {showCurrencyField && (
                <FieldSelect
                  id="currency"
                  name="currency"
                  label={intl.formatMessage({ id: 'CouponForm.currencyLabel' })}
                  validate={required('Currency is required')}
                  className={css.field}
                  disabled={true} // Keep currency disabled, default USD
                >
                  <option value="USD">USD - US Dollar</option>
                  {CURRENCIES.filter(c => c.key !== 'USD').map(option => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </FieldSelect>
              )}
            </div>

            {/* Funded By field removed as requested */}

            <FieldTextInput
              id="expiresAt"
              name="expiresAt"
              type="datetime-local"
              label={intl.formatMessage({ id: 'CouponForm.expiresAtLabel' })}
              validate={validateExpirationDate}
              className={css.field}
            />

            <FieldTextInput
              id="maxRedemptions"
              name="maxRedemptions"
              type="number"
              min="1"
              step="1"
              label={intl.formatMessage({ id: 'CouponForm.maxRedemptionsLabel' })}
              placeholder="Leave empty for unlimited"
              validate={validateMaxRedemptions}
              className={css.field}
              inputProps={{
                autoComplete: 'off'
              }}
            />

            <FieldCheckbox
              id="isActive"
              name="isActive"
              label={intl.formatMessage({ id: 'CouponForm.isActiveLabel' })}
              className={css.field}
            />

            <div className={css.actions}>
              <Button
                type="button"
                onClick={onCancel}
                className={css.cancelButton}
              >
                <FormattedMessage id="CouponForm.cancel" />
              </Button>
              <Button
                type="submit"
                inProgress={submitInProgress}
                disabled={submitDisabled || invalid}
                className={css.submitButton}
              >
                <FormattedMessage 
                  id={isEdit ? 'CouponForm.updateCoupon' : 'CouponForm.createCoupon'} 
                />
              </Button>
            </div>
          </Form>
        );
      }}
    />
  );
};

CouponFormComponent.defaultProps = {
  initialValues: null,
  formError: null,
  isEdit: false,
};

CouponFormComponent.propTypes = {
  onSubmit: func.isRequired,
  inProgress: bool.isRequired,
  formError: propTypes.error,
  onCancel: func.isRequired,
  initialValues: object,
  isEdit: bool,
  intl: intlShape.isRequired,
};

const CouponForm = compose(injectIntl)(CouponFormComponent);

export default CouponForm;
