import React, { useState, useRef, useEffect } from 'react';
import { Field } from 'react-final-form';
import { FormattedMessage } from '../../util/reactIntl';

import css from './MultiSelect.module.css';

/**
 * Reusable MultiSelect Dropdown Component
 * 
 * @param {Object} props
 * @param {Array} props.options - Array of options with name property
 * @param {string} props.name - Form field name
 * @param {string} props.label - Label for the dropdown
 * @param {string} props.id - Unique identifier
 * @param {boolean} props.disabled - Whether the component is disabled
 * @param {string} props.placeholder - Placeholder text when no items selected
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onChange - Custom onChange handler called with selected values
 * @param {Function} props.getOptionLabel - Function(option) => string to render in dropdown list
 * @param {Function} props.getTagLabel - Function(option) => string to render for selected tags
 */
const MultiSelect = ({ 
  options, 
  name, 
  label, 
  id, 
  disabled = false, 
  placeholder = 'Select options...',
  className = '',
  onChange,
  getOptionLabel,
  getTagLabel
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const getDisplayText = (selectedValues) => {
    if (!selectedValues || selectedValues.length === 0) {
      return placeholder;
    }
    if (selectedValues.length === 1) {
      return selectedValues[0];
    }
    return `${selectedValues.length} items selected`;
  };

  return (
    <Field name={name}>
      {({ input, meta }) => {
        const selectedValues = input.value || [];
        
        const handleOptionClick = (optionName) => {
          const newSelectedValues = selectedValues.includes(optionName)
            ? selectedValues.filter(item => item !== optionName)
            : [...selectedValues, optionName];
          
          input.onChange(newSelectedValues);
          
          // Call custom onChange handler if provided
          if (onChange) {
            onChange(newSelectedValues);
          }
        };

        const removeSelected = (optionToRemove) => {
          const newSelectedValues = selectedValues.filter(item => item !== optionToRemove);
          input.onChange(newSelectedValues);
          
          // Call custom onChange handler if provided
          if (onChange) {
            onChange(newSelectedValues);
          }
        };

        return (
          <div className={`${css.multiSelectContainer} ${className}`} ref={dropdownRef}>
            {label && (
              <label className={css.label} htmlFor={id}>
                {label}
              </label>
            )}
            
            <div className={css.dropdownWrapper}>
              <div
                className={`${css.dropdownTrigger} ${isOpen ? css.open : ''} ${disabled ? css.disabled : ''}`}
                onClick={handleToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggle();
                  }
                }}
              >
                <div className={css.selectedText}>{getDisplayText(selectedValues)}</div>
                <div className={css.arrow} />
              </div>

              {isOpen && (
                <div className={css.dropdownMenu}>
                  {options.map((option) => (
                    <div
                      key={option.name}
                      className={`${css.dropdownOption} ${selectedValues.includes(option.name) ? css.selected : ''}`}
                      onClick={() => handleOptionClick(option.name)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOptionClick(option.name);
                        }
                      }}
                    >
                      <div className={css.checkboxWrapper}>
                        <input
                          type="checkbox"
                          checked={selectedValues.includes(option.name)}
                          readOnly
                          className={css.checkbox}
                        />
                      </div>
                      <span className={css.optionLabel}>{getOptionLabel ? getOptionLabel(option) : option.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected items display */}
            {selectedValues.length > 0 && (
              <div className={css.selectedItems}>
                {selectedValues.map((item) => {
                  const option = options.find(o => o.name === item);
                  const labelForTag = option ? (getTagLabel ? getTagLabel(option) : option.name) : item;
                  return (
                  <span key={item} className={css.selectedTag}>
                    {labelForTag}
                    <button
                      type="button"
                      className={css.removeButton}
                      onClick={() => removeSelected(item)}
                      disabled={disabled}
                    >
                      ×
                    </button>
                  </span>
                )})}
              </div>
            )}
          </div>
        );
      }}
    </Field>
  );
};

export default MultiSelect;
