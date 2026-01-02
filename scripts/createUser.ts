// Script to create a test user for the new authentication system
// Run with: node --loader ts-node/esm scripts/createUser.ts

import mongoose from 'mongoose';
import User from '../models/User';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function createUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB');

    // Create a test user
    const user = await User.create({
      email: 'admin@eduflow.ai',
      password: 'admin123', // Will be hashed automatically
      name: 'Admin User',
      schoolId: null, // Will be set during school setup
    });

    console.log('✅ User created successfully:');
    console.log('   Email:', user.email);
    console.log('   Name:', user.name);
    console.log('   ID:', user._id);
    console.log('\n🔑 Login credentials:');
    console.log('   Email: admin@eduflow.ai');
    console.log('   Password: admin123');

    await mongoose.disconnect();
  } catch (error: any) {
    if (error.code === 11000) {
      console.log('ℹ️  User already exists with this email');
    } else {
      console.error('❌ Error creating user:', error);
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

createUser();
