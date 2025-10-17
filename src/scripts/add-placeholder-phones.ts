
import mongoose from 'mongoose';
import User from '../user/user.model';
import connectDB from '../config/db';

const addPlaceholderPhones = async () => {
  try {
    await connectDB();
    console.log('Database connected. Starting script...');

    const usersToUpdate = await User.find({
      $or: [
        { phone: { $exists: false } },
        { phone: null },
        { phone: '' }
      ]
    });

    if (usersToUpdate.length === 0) {
      console.log('No users found without a phone number. Exiting.');
      return;
    }

    console.log(`Found ${usersToUpdate.length} users without a phone number. Updating...`);

    for (const user of usersToUpdate) {
      const placeholderPhone = `+00000000000`; 
      user.phone = placeholderPhone;
      await user.save({ validateBeforeSave: false }); // Bypass validation to set the placeholder
      console.log(`Updated user ${user.userId} with placeholder phone number.`);
    }

    console.log('Script finished successfully.');

  } catch (error) {
    console.error('An error occurred during the script execution:', error);
  } finally {
    console.log('Database disconnected.');
  }
};

addPlaceholderPhones();
