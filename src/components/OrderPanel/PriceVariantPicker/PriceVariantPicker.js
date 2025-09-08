import React from 'react';
import { Field } from 'react-final-form';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { createSlug } from '../../../util/urlHelpers';
import { types as sdkTypes } from '../../../util/sdkLoader';
import { formatMoney } from '../../../util/currency';

import { MultiSelect } from '../../../components';

import css from './PriceVariantPicker.module.css';

const DEFAULT_PRICE_VARIANT_NAME = 'default-variant-name';

const VariantNameMaybe = props => {
  const { className, priceVariant } = props;
  return priceVariant?.name ? (
    <div className={className}>
      <FormattedMessage
        id="PriceVariantPicker.onePriceVariantOnly"
        values={{ priceVariantName: priceVariant?.name }}
      />
    </div>
  ) : null;
};

const FieldHidden = props => {
  const { name, ...rest } = props;
  return (
    <Field id={name} name={name} type="hidden" className={css.hidden} {...rest}>
      {fieldRenderProps => <input {...fieldRenderProps?.input} />}
    </Field>
  );
};

const { Money } = sdkTypes;

const PriceVariantPicker = props => {
  const intl = useIntl();
  const {
    priceVariants,
    onPriceVariantChange,
    onPriceVariantNamesChange,
    formApi,
    disabled,
    currency,
  } = props;
  const hasMultiplePriceVariants = priceVariants?.length > 1;
  const hasOnePriceVariant = priceVariants?.length === 1;

  return hasMultiplePriceVariants ? (
    <>
      {/* <FieldSelect
        name="priceVariantName"
        id="priceVariant"
        className={css.priceVariantFieldSelect}
        selectClassName={css.priceVariantSelect}
        label={intl.formatMessage({ id: 'PriceVariantPicker.priceVariantLabel' })}
        onChange={onPriceVariantChange}
        disabled={disabled}
        showLabelAsDisabled={disabled}
      >
        <option disabled value="" key="unselected">
          {intl.formatMessage({ id: 'PriceVariantPicker.priceVariantUnselected' })}
        </option>
        {priceVariants.map(pv => (
          <option value={pv.name} key={pv.name} data-slug={createSlug(pv.name)}>
            {pv.name}
          </option>
        ))}
      </FieldSelect> */}
      {/* Multi-select dropdown for multiple price variants */}
      <Field name="priceVariantName">
        {({ input: priceVariantNameInput }) => (
          <MultiSelect
            options={priceVariants}
            name="priceVariantNames"
            label={intl.formatMessage({ id: 'PriceVariantPicker.priceVariantLabel' })}
            id="priceVariants"
            disabled={disabled}
            placeholder={intl.formatMessage({ id: 'PriceVariantPicker.priceVariantUnselected' })}
            className={css.priceVariantFieldSelect}
            getOptionLabel={(option) => {
              const money = option?.priceInSubunits != null && currency ? new Money(option.priceInSubunits, currency) : null;
              const priceStr = money ? formatMoney(intl, money) : '';
              const durationStr = option?.bookingLengthInMinutes != null ? `${Math.floor(option.bookingLengthInMinutes / 60) ? Math.floor(option.bookingLengthInMinutes / 60) + 'h ' : ''}${(option.bookingLengthInMinutes || 0) % 60}minutes` : '';
              return [option?.name, durationStr && `(${durationStr})`, priceStr && `- ${priceStr}`].filter(Boolean).join(' ');
            }}
            getTagLabel={(option) => {
              const money = option?.priceInSubunits != null && currency ? new Money(option.priceInSubunits, currency) : null;
              const priceStr = money ? formatMoney(intl, money) : '';
              const durationStr = option?.bookingLengthInMinutes != null ? `${Math.floor(option.bookingLengthInMinutes / 60) ? Math.floor(option.bookingLengthInMinutes / 60) + 'h ' : ''}${(option.bookingLengthInMinutes || 0) % 60}minutes` : '';
              return [option?.name, durationStr && `(${durationStr})`, priceStr && `- ${priceStr}`].filter(Boolean).join(' ');
            }}
            onChange={selectedValues => {
              // Update priceVariantName field to the first selected value
              const firstSelected =
                selectedValues && selectedValues.length > 0 ? selectedValues[0] : null;
              priceVariantNameInput.onChange(firstSelected);

              // Call the priceVariantNames change handler if provided
              if (onPriceVariantNamesChange) {
                onPriceVariantNamesChange(selectedValues);
              }

              // Call the original onChange handler if provided
              if (onPriceVariantChange) {
                onPriceVariantChange(selectedValues);
              }
            }}
          />
        )}
      </Field>
    </>
  ) : hasOnePriceVariant ? (
    <>
      <VariantNameMaybe priceVariant={priceVariants?.[0]} className={css.priceVariantName} />
      <FieldHidden
        name="priceVariantName"
        format={value => {
          return value == null ? DEFAULT_PRICE_VARIANT_NAME : value;
        }}
        parse={value => {
          const response = value === DEFAULT_PRICE_VARIANT_NAME ? null : value;
          return response;
        }}
      />
    </>
  ) : null;
};

export default PriceVariantPicker;
