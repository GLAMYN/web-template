import React from 'react';
import { FinalForm } from '../../../util/testHelpers';
import PriceVariantPicker from './PriceVariantPicker';

const priceVariants = [
  { name: 'Standard' },
  { name: 'Premium' },
  { name: 'Deluxe' },
  { name: 'VIP' },
  { name: 'Executive' },
  { name: 'Luxury' }
];

const PriceVariantPickerExample = () => {
  const onSubmit = values => {
    console.log('Form submitted with values:', values);
    console.log('Selected price variants:', values.priceVariantNames);
    console.log('Primary price variant (backward compatibility):', values.priceVariantName);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '20px' }}>
      <h2>PriceVariantPicker Multi-Select Dropdown Example</h2>
      <p>This example demonstrates the multi-select dropdown functionality using the reusable MultiSelect component.</p>
      
      <FinalForm
        onSubmit={onSubmit}
        initialValues={{
          priceVariantNames: ['Standard'], // Pre-select one option
          priceVariantName: 'Standard'     // Backward compatibility field
        }}
        render={({ handleSubmit, values }) => (
          <form onSubmit={handleSubmit}>
            <PriceVariantPicker
              priceVariants={priceVariants}
              disabled={false}
            />
            
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5' }}>
              <h3>Current Form Values:</h3>
              <pre>{JSON.stringify(values, null, 2)}</pre>
            </div>
            
            <button 
              type="submit" 
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#007cba',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Submit Form
            </button>
          </form>
        )}
      />
      
             <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#e8f4fd' }}>
         <h3>How the MultiSelect Component Works:</h3>
         <ul>
           <li><strong>Reusable Component:</strong> The MultiSelect is now a separate, reusable component</li>
           <li><strong>Dropdown Interface:</strong> Click the dropdown to see all available price variants</li>
           <li><strong>Multi-selection:</strong> Check multiple checkboxes to select several variants</li>
           <li><strong>Visual Feedback:</strong> Selected options are highlighted in the dropdown</li>
           <li><strong>Selected Tags:</strong> Chosen variants appear as removable tags below the dropdown</li>
           <li><strong>Easy Removal:</strong> Remove individual selections by clicking the × button on tags</li>
           <li><strong>Form Integration:</strong> Selected variants are stored in <code>priceVariantNames</code> array</li>
           <li><strong>Automatic Sync:</strong> The <code>priceVariantName</code> field is automatically set to the first selected variant</li>
           <li><strong>Backward Compatibility:</strong> Existing forms continue to work with the single value field</li>
         </ul>
       </div>

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7' }}>
        <h3>Key Benefits:</h3>
        <ul>
          <li><strong>Reusability:</strong> MultiSelect component can be used throughout the application</li>
          <li><strong>Familiar UX:</strong> Looks and behaves like a traditional select field</li>
          <li><strong>Better Space Usage:</strong> Compact dropdown that expands when needed</li>
          <li><strong>Clear Selection State:</strong> Visual checkboxes and selected tags</li>
          <li><strong>Accessibility:</strong> Keyboard navigation and screen reader support</li>
          <li><strong>No Mutators Required:</strong> Uses standard Final Form components</li>
        </ul>
      </div>
    </div>
  );
};

export default PriceVariantPickerExample;
