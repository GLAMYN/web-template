const { getSdk, handleError, serialize } = require('../api-util/sdk');
const { v4: uuidv4 } = require('uuid');

/**
 * Coupon management API endpoints
 * Handles creating, reading, updating, and deleting coupon codes for providers
 */

// Coupon validation helper
const validateCouponData = (couponData) => {
  const { code, type, amount, currency, expiresAt, maxRedemptions, applicableListingIds } = couponData;
  
  const errors = [];
  
  if (!code || typeof code !== 'string' || code.trim().length < 3) {
    errors.push('Coupon code must be at least 3 characters long');
  }
  
  if (!type || !['fixed', 'percentage'].includes(type)) {
    errors.push('Type must be either "fixed" or "percentage"');
  }
  
  const numAmount = Number(amount);
  if (!amount || isNaN(numAmount) || numAmount <= 0) {
    errors.push('Amount must be a positive number');
  }
  
  if (type === 'percentage' && numAmount > 100) {
    errors.push('Percentage discount cannot exceed 100%');
  }
  
  if (type === 'fixed' && (!currency || typeof currency !== 'string')) {
    errors.push('Currency is required for fixed amount discounts');
  }
  
  // fundedBy field removed - will default to 'provider' in creation
  
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    errors.push('Expiration date must be in the future');
  }
  
  if (maxRedemptions) {
    const numMaxRedemptions = Number(maxRedemptions);
    if (isNaN(numMaxRedemptions) || numMaxRedemptions < 1) {
      errors.push('Max redemptions must be a positive number');
    }
  }
  
  if (applicableListingIds && !Array.isArray(applicableListingIds)) {
    errors.push('Applicable listing IDs must be an array');
  }
  
  return errors;
};

// Create a new coupon
const createCoupon = async (req, res) => {
  const sdk = getSdk(req, res);
  const { code, type, amount, currency, fundedBy, expiresAt, maxRedemptions, applicableListingIds, isActive = true } = req.body;
  
  try {
    // Get current user to verify they are a provider
    const currentUser = await sdk.currentUser.show();
    const userId = currentUser.data.data.id.uuid;
    
    // Validate coupon data
    const validationErrors = validateCouponData(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).send({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }
    
    // Create coupon data structure
    const couponData = {
      id: uuidv4(),
      code: code.trim().toUpperCase(),
      type,
      amount: Number(amount), // Convert to number
      currency: type === 'fixed' ? (currency || 'USD') : null, // Default to USD
      fundedBy: 'provider', // Always default to provider
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null, // Convert to number
      usedCount: 0,
      applicableListingIds: applicableListingIds || [],
      isActive: isActive === 'true' || isActive === true, // Handle boolean conversion
      providerId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Store coupon as extended data on user profile
    const currentUserData = currentUser.data.data;
    const existingCoupons = currentUserData.attributes.profile?.privateData?.coupons || [];
    
    // Check if coupon code already exists for this provider
    const existingCoupon = existingCoupons.find(c => c.code === couponData.code);
    if (existingCoupon) {
      return res.status(400).send({
        success: false,
        error: 'Coupon code already exists'
      });
    }
    
    // Add new coupon to existing coupons
    const updatedCoupons = [...existingCoupons, couponData];
    
    // Update user profile with new coupon
    await sdk.currentUser.updateProfile({
      privateData: {
        ...currentUserData.attributes.profile?.privateData,
        coupons: updatedCoupons
      }
    });
    
    res.status(201).send({
      success: true,
      data: couponData
    });
    
  } catch (error) {
    console.error('Create coupon error:', error);
    handleError(res, error);
  }
};

// Get all coupons for current provider
const getCoupons = async (req, res) => {
  const sdk = getSdk(req, res);
  
  try {
    const currentUser = await sdk.currentUser.show();
    const coupons = currentUser.data.data.attributes.profile?.privateData?.coupons || [];
    
    res.status(200).send({
      success: true,
      data: coupons
    });
    
  } catch (error) {
    console.error('Get coupons error:', error);
    handleError(res, error);
  }
};

// Update a coupon
const updateCoupon = async (req, res) => {
  const sdk = getSdk(req, res);
  const { couponId } = req.params;
  const updateData = req.body;
  
  try {
    const currentUser = await sdk.currentUser.show();
    const currentUserData = currentUser.data.data;
    const existingCoupons = currentUserData.attributes.profile?.privateData?.coupons || [];
    
    // Find coupon to update
    const couponIndex = existingCoupons.findIndex(c => c.id === couponId);
    if (couponIndex === -1) {
      return res.status(404).send({
        success: false,
        error: 'Coupon not found'
      });
    }
    
    const existingCoupon = existingCoupons[couponIndex];
    
    // Merge update data with existing coupon, converting data types
    const updatedCoupon = {
      ...existingCoupon,
      ...updateData,
      // Convert numeric fields from strings to numbers
      amount: updateData.amount ? Number(updateData.amount) : existingCoupon.amount,
      maxRedemptions: updateData.maxRedemptions ? Number(updateData.maxRedemptions) : existingCoupon.maxRedemptions,
      isActive: updateData.isActive !== undefined ? (updateData.isActive === 'true' || updateData.isActive === true) : existingCoupon.isActive,
      id: couponId, // Ensure ID doesn't change
      providerId: existingCoupon.providerId, // Ensure provider doesn't change
      fundedBy: existingCoupon.fundedBy || 'provider', // Preserve existing or default to provider
      currency: updateData.type === 'fixed' ? (updateData.currency || existingCoupon.currency || 'USD') : null,
      createdAt: existingCoupon.createdAt, // Ensure created date doesn't change
      updatedAt: new Date().toISOString()
    };
    
    // Validate updated coupon data
    const validationErrors = validateCouponData(updatedCoupon);
    if (validationErrors.length > 0) {
      return res.status(400).send({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }
    
    // Update coupon in array
    const updatedCoupons = [...existingCoupons];
    updatedCoupons[couponIndex] = updatedCoupon;
    
    // Update user profile
    await sdk.currentUser.updateProfile({
      privateData: {
        ...currentUserData.attributes.profile?.privateData,
        coupons: updatedCoupons
      }
    });
    
    res.status(200).send({
      success: true,
      data: updatedCoupon
    });
    
  } catch (error) {
    console.error('Update coupon error:', error);
    handleError(res, error);
  }
};

// Delete a coupon
const deleteCoupon = async (req, res) => {
  const sdk = getSdk(req, res);
  const { couponId } = req.params;
  
  try {
    const currentUser = await sdk.currentUser.show();
    const currentUserData = currentUser.data.data;
    const existingCoupons = currentUserData.attributes.profile?.privateData?.coupons || [];
    
    // Find coupon to delete
    const couponIndex = existingCoupons.findIndex(c => c.id === couponId);
    if (couponIndex === -1) {
      return res.status(404).send({
        success: false,
        error: 'Coupon not found'
      });
    }
    
    // Remove coupon from array
    const updatedCoupons = existingCoupons.filter(c => c.id !== couponId);
    
    // Update user profile
    await sdk.currentUser.updateProfile({
      privateData: {
        ...currentUserData.attributes.profile?.privateData,
        coupons: updatedCoupons
      }
    });
    
    res.status(200).send({
      success: true,
      message: 'Coupon deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete coupon error:', error);
    handleError(res, error);
  }
};

module.exports = {
  createCoupon,
  getCoupons,
  updateCoupon,
  deleteCoupon,
  validateCouponData,
};
