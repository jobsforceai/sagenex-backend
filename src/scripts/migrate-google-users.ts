import mongoose from 'mongoose';
import 'dotenv/config';

import User from '../user/user.model'; // Adjust the path based on your project structure
import connectDB from '../config/db';

/**
 * One-time script to update existing Google users to mark their email as verified.
 */
const migrateGoogleUsers = async () => {
  console.log('Starting migration script for Google users...');

  try {
    // 1. Connect to the database
    await connectDB();
    console.log('Database connected successfully.');

    // 2. Find all users who signed up with Google (have a googleId)
    //    and where isEmailVerified is not already explicitly set to true.
    const query = {
      googleId: { $exists: true, $ne: null },
      isEmailVerified: { $ne: true },
    };

    // 3. Update the found users
    const result = await User.updateMany(query, {
      $set: { isEmailVerified: true },
    });

    console.log('Migration complete.');
    console.log(`Successfully updated ${result.modifiedCount} user(s).`);
    console.log(`${result.matchedCount} user(s) matched the criteria.`);

  } catch (error) {
    console.error('An error occurred during the migration:', error);
  } finally {
    // 4. Disconnect from the database
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
};

// Execute the script
migrateGoogleUsers();
